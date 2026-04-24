import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { app } from 'electron'
import {
  buildStreamOptionSummary,
  createDefaultBilibiliDownloaderState,
  normalizeBilibiliParsedLink,
  parseBilibiliLink
} from '../../shared/bilibiliDownloader'
import { screenRecorderService } from './ScreenRecorderService'
import type {
  BilibiliDownloaderState,
  BilibiliExportMode,
  BilibiliLinkKind,
  BilibiliLoginSession,
  BilibiliParsedLink,
  BilibiliStreamOptionSummary,
  IpcResponse
} from '../../shared/types'

const QR_BOOTSTRAP_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const QR_POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'
const SESSION_FILE_NAME = 'bilibili-downloader-session.json'
const BILIBILI_VIDEO_VIEW_URL = 'https://api.bilibili.com/x/web-interface/view'
const BILIBILI_VIDEO_PLAY_URL = 'https://api.bilibili.com/x/player/playurl'
const BILIBILI_BANGUMI_SEASON_URL = 'https://api.bilibili.com/pgc/view/web/season'
const BILIBILI_BANGUMI_PLAY_URL = 'https://api.bilibili.com/pgc/player/web/playurl'
const DEFAULT_STREAM_QN = 120
const DEFAULT_FNVAL = 4048

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{
  ok?: boolean
  status?: number
  json: () => Promise<any>
  arrayBuffer?: () => Promise<ArrayBuffer>
}>

type AppLike = Pick<typeof app, 'getPath'>

type FsLike = Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'readFileSync' | 'renameSync' | 'unlinkSync'> & {
  promises: Pick<typeof fs.promises, 'mkdir' | 'rm' | 'writeFile'>
}

type DownloadBinaryInput = {
  url: string
  destinationPath: string
  signal: AbortSignal
  headers: Record<string, string>
}

type DownloadBinaryLike = (input: DownloadBinaryInput) => Promise<void>

type RunFfmpegInput = {
  ffmpegPath: string
  videoPath: string
  audioPath: string
  outputPath: string
}

type RunFfmpegLike = (input: RunFfmpegInput) => Promise<void>

type BilibiliDownloaderServiceDependencies = {
  app?: AppLike
  fs?: FsLike
  fetch?: FetchLike
  now?: () => number
  downloadBinary?: DownloadBinaryLike
  getFfmpegPath?: () => string | null
  runFfmpeg?: RunFfmpegLike
}

type StateListener = (state: BilibiliDownloaderState) => void

type BootstrapPayload = {
  qrUrl: string
  authCode: string
}

type PollStatus = 'pending' | 'scanned' | 'confirmed' | 'expired' | 'invalid'

type PollPayload = {
  status: PollStatus
  loginSession?: BilibiliLoginSession
}

type BilibiliAuthSession = {
  sessData: string
  biliJct: string
  refreshToken: string | null
}

type PersistedSessionRecord = {
  loginSession: BilibiliLoginSession
  auth: BilibiliAuthSession | null
  source: 'current' | 'legacy'
}

type ParseLinkRequest = {
  url: string
}

type LoadStreamOptionsRequest = {
  kind: BilibiliLinkKind
  itemId: string
}

type StreamOption = {
  qn: number
  label: string
  selected: boolean
  available: boolean
}

type LoadStreamOptionsPayload = {
  itemId: string
  qnOptions: StreamOption[]
  summary: BilibiliStreamOptionSummary
}

type StartDownloadRequest = {
  exportMode: BilibiliExportMode | null
  outputDirectory?: string
}

type StartDownloadPayload = {
  outputPaths: string[]
  tempDirectory: string
}

type ItemPlaybackTarget = {
  cid: number | null
  page?: number
  epId?: string
  seasonId?: string
}

type DashResource = {
  id?: number
  baseUrl?: string
  base_url?: string
  backupUrl?: string[]
  backup_url?: string[]
}

type ActiveDownloadTask = {
  controller: AbortController
  tempDirectory: string
}

const TASK_ROOT_DIRECTORY_NAME = 'bilibili-downloader'
const TASKS_DIRECTORY_NAME = 'tasks'
const VIDEO_TRACK_FILE_NAME = 'video-track.m4s'
const AUDIO_TRACK_FILE_NAME = 'audio-track.m4s'

function cloneState(state: BilibiliDownloaderState): BilibiliDownloaderState {
  return JSON.parse(JSON.stringify(state))
}

function normalizeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized : null
}

function createLoggedOutSession(): BilibiliLoginSession {
  return {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  }
}

function createReauthenticationRequiredSession(session: BilibiliLoginSession): BilibiliLoginSession {
  return {
    isLoggedIn: false,
    nickname: session.nickname,
    avatarUrl: session.avatarUrl,
    expiresAt: session.expiresAt
  }
}

function isValidExpiresAt(value: unknown) {
  if (value === null) {
    return true
  }

  if (typeof value !== 'string') {
    return false
  }

  return Number.isFinite(Date.parse(value))
}

function isValidLoginSession(value: unknown): value is BilibiliLoginSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const session = value as Record<string, unknown>
  return (
    typeof session.isLoggedIn === 'boolean' &&
    (typeof session.nickname === 'string' || session.nickname === null) &&
    (typeof session.avatarUrl === 'string' || session.avatarUrl === null) &&
    isValidExpiresAt(session.expiresAt)
  )
}

function isExpiredSession(session: BilibiliLoginSession, now: number) {
  if (!session.expiresAt) {
    return false
  }

  const expiresAt = Date.parse(session.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

function normalizeConfirmedSession(payload: any) {
  const loginSession: BilibiliLoginSession = {
    isLoggedIn: true,
    nickname: normalizeText(payload?.user_info?.uname),
    avatarUrl: normalizeText(payload?.user_info?.face),
    expiresAt: normalizeText(payload?.expires_at)
  }

  const cookieEntries = Array.isArray(payload?.cookie_info?.cookies) ? payload.cookie_info.cookies : []
  const cookieMap = new Map<string, string>()
  for (const cookie of cookieEntries) {
    const name = normalizeText(cookie?.name)
    const value = normalizeText(cookie?.value)
    if (name && value) {
      cookieMap.set(name, value)
    }
  }

  const sessData = normalizeText(payload?.sessdata) ?? cookieMap.get('SESSDATA') ?? null
  const biliJct = normalizeText(payload?.bili_jct) ?? cookieMap.get('bili_jct') ?? null

  if (!sessData || !biliJct) {
    throw new Error('Bilibili confirmed login is missing auth cookies')
  }

  const auth: BilibiliAuthSession = {
    sessData,
    biliJct,
    refreshToken: normalizeText(payload?.refresh_token)
  }

  return {
    loginSession,
    auth
  }
}

function isValidAuthSession(value: unknown): value is BilibiliAuthSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const auth = value as Record<string, unknown>
  return (
    typeof auth.sessData === 'string' &&
    auth.sessData.trim().length > 0 &&
    typeof auth.biliJct === 'string' &&
    auth.biliJct.trim().length > 0 &&
    (typeof auth.refreshToken === 'string' || auth.refreshToken === null)
  )
}

function normalizePersistedSessionRecord(value: unknown): PersistedSessionRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  if (isValidLoginSession(record) && record.isLoggedIn) {
    return {
      loginSession: record,
      auth: null,
      source: 'legacy'
    }
  }

  if (!isValidLoginSession(record.loginSession) || !record.loginSession.isLoggedIn || !isValidAuthSession(record.auth)) {
    return null
  }

  return {
    loginSession: record.loginSession,
    auth: record.auth,
    source: 'current'
  }
}

function resolvePollStatus(payload: any): PollStatus {
  const status = String(payload?.status ?? '').trim().toLowerCase()
  const code = Number(payload?.code)

  if (status === 'confirmed' || code === 0) {
    return 'confirmed'
  }

  if (status === 'pending' || code === 86101) {
    return 'pending'
  }

  if (status === 'scanned' || code === 86090) {
    return 'scanned'
  }

  if (status === 'expired' || code === 86038) {
    return 'expired'
  }

  return 'invalid'
}

function buildItemTitle(primary: unknown, secondary?: unknown, fallback?: string) {
  const parts = [normalizeText(primary), normalizeText(secondary)].filter(Boolean)
  if (parts.length > 0) {
    return parts.join(' ')
  }

  return normalizeText(fallback) ?? fallback ?? ''
}

function parseNumericId(rawValue: string | undefined, prefix: string) {
  const normalized = String(rawValue ?? '').trim()
  if (!normalized) {
    return null
  }

  if (normalized.startsWith(prefix)) {
    const stripped = normalized.slice(prefix.length)
    return stripped || null
  }

  return normalized
}

function normalizePositiveNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null
  }

  return Math.trunc(numberValue)
}

export class BilibiliDownloaderService {
  private readonly app: AppLike
  private readonly fs: FsLike
  private readonly fetchImpl: FetchLike | null
  private readonly now: () => number
  private readonly downloadBinaryImpl: DownloadBinaryLike
  private readonly getFfmpegPathImpl: () => string | null
  private readonly runFfmpegImpl: RunFfmpegLike
  private readonly stateListeners = new Set<StateListener>()

  private state: BilibiliDownloaderState = createDefaultBilibiliDownloaderState()
  private authSession: BilibiliAuthSession | null = null
  private pendingAuthCode: string | null = null
  private readonly itemPlaybackTargets = new Map<string, ItemPlaybackTarget>()
  private readonly playPayloads = new Map<string, any>()
  private activeDownloadTask: ActiveDownloadTask | null = null

  constructor(dependencies: BilibiliDownloaderServiceDependencies = {}) {
    this.app = dependencies.app ?? app
    this.fs = dependencies.fs ?? fs
    this.fetchImpl = dependencies.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
    this.now = dependencies.now ?? (() => Date.now())
    this.downloadBinaryImpl = dependencies.downloadBinary ?? ((input) => this.downloadBinary(input))
    this.getFfmpegPathImpl = dependencies.getFfmpegPath ?? (() => {
      const bundledFfmpegPath = screenRecorderService.getFfmpegPath()
      return process.env.FFMPEG_PATH ?? bundledFfmpegPath ?? 'ffmpeg'
    })
    this.runFfmpegImpl = dependencies.runFfmpeg ?? ((input) => this.runFfmpeg(input))
  }

  onStateChanged(listener: StateListener) {
    this.stateListeners.add(listener)

    return () => {
      this.stateListeners.delete(listener)
    }
  }

  getState(): BilibiliDownloaderState {
    return cloneState(this.state)
  }

  getAuthSession(): BilibiliAuthSession | null {
    return this.authSession ? { ...this.authSession } : null
  }

  loadSession(): IpcResponse<BilibiliLoginSession> {
    try {
      const sessionPath = this.getSessionPath()
      if (!this.fs.existsSync(sessionPath)) {
        return {
          success: true,
          data: this.getState().loginSession
        }
      }

      const raw = this.fs.readFileSync(sessionPath, 'utf-8')
      let parsed: unknown

      try {
        parsed = JSON.parse(raw)
      } catch {
        this.clearPersistedSession()
        this.updateState({
          loginSession: createLoggedOutSession(),
          error: 'Stored Bilibili session is invalid'
        })
        return {
          success: false,
          error: 'Stored Bilibili session is invalid'
        }
      }

      const persisted = normalizePersistedSessionRecord(parsed)
      if (!persisted) {
        this.clearPersistedSession()
        this.authSession = null
        this.updateState({
          loginSession: createLoggedOutSession(),
          error: 'Stored Bilibili session is invalid'
        })
        return {
          success: false,
          error: 'Stored Bilibili session is invalid'
        }
      }

      if (isExpiredSession(persisted.loginSession, this.now())) {
        this.clearPersistedSession()
        this.authSession = null
        this.updateState({
          loginSession: createLoggedOutSession(),
          error: 'Stored Bilibili session expired'
        })
        return {
          success: false,
          error: 'Stored Bilibili session expired'
        }
      }

      if (!persisted.auth) {
        this.authSession = null
        const migratedState = createReauthenticationRequiredSession(persisted.loginSession)
        this.updateState({
          loginSession: migratedState,
          error: 'Stored Bilibili session requires re-authentication'
        })
        return {
          success: false,
          error: 'Stored Bilibili session requires re-authentication',
          data: migratedState
        }
      }

      this.authSession = persisted.auth
      this.updateState({
        loginSession: persisted.loginSession,
        error: null
      })
      return {
        success: true,
        data: persisted.loginSession
      }
    } catch (error) {
      this.clearPersistedSession()
      this.authSession = null
      this.updateState({
        loginSession: createLoggedOutSession(),
        error: this.toErrorMessage(error)
      })
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async bootstrapQrLogin(): Promise<IpcResponse<BootstrapPayload>> {
    if (!this.fetchImpl) {
      return {
        success: false,
        error: 'Fetch is not available'
      }
    }

    try {
      const response = await this.fetchImpl(QR_BOOTSTRAP_URL)
      const payload = await response.json()
      const qrUrl = normalizeText(payload?.data?.url)
      const authCode = normalizeText(payload?.data?.qrcode_key)

      if (!qrUrl || !authCode) {
        throw new Error('Bilibili QR bootstrap response is missing url or qrcode_key')
      }

      this.pendingAuthCode = authCode
      return {
        success: true,
        data: {
          qrUrl,
          authCode
        }
      }
    } catch (error) {
      this.updateState({
        error: this.toErrorMessage(error)
      })
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async pollLogin(): Promise<IpcResponse<PollPayload>> {
    if (!this.pendingAuthCode) {
      return {
        success: false,
        error: 'QR login has not been initialized'
      }
    }

    if (!this.fetchImpl) {
      return {
        success: false,
        error: 'Fetch is not available'
      }
    }

    try {
      const response = await this.fetchImpl(`${QR_POLL_URL}?qrcode_key=${encodeURIComponent(this.pendingAuthCode)}`)
      const payload = await response.json()
      const pollData = payload?.data ?? {}
      const status = resolvePollStatus(pollData)

      if (status === 'pending' || status === 'scanned') {
        this.updateState({ error: null })
        return {
          success: true,
          data: { status }
        }
      }

      if (status === 'expired') {
        this.pendingAuthCode = null
        this.clearPersistedSession()
        this.authSession = null
        this.updateState({
          loginSession: createLoggedOutSession(),
          error: 'QR login expired'
        })
        return {
          success: false,
          error: 'QR login expired'
        }
      }

      if (status === 'confirmed') {
        const confirmedSession = normalizeConfirmedSession(pollData)
        await this.persistSession({
          ...confirmedSession,
          source: 'current'
        })
        this.pendingAuthCode = null
        this.authSession = confirmedSession.auth
        this.updateState({
          loginSession: confirmedSession.loginSession,
          error: null
        })
        return {
          success: true,
          data: {
            status,
            loginSession: confirmedSession.loginSession
          }
        }
      }

      this.pendingAuthCode = null
      this.clearPersistedSession()
      this.authSession = null
      this.updateState({
        loginSession: createLoggedOutSession(),
        error: 'Bilibili login status was invalid'
      })
      return {
        success: false,
        error: 'Bilibili login status was invalid'
      }
    } catch (error) {
      this.updateState({
        error: this.toErrorMessage(error)
      })
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async logout(): Promise<IpcResponse> {
    try {
      this.pendingAuthCode = null
      this.clearPersistedSession()
      this.authSession = null
      this.updateState({
        loginSession: createLoggedOutSession(),
        error: null
      })
      return { success: true }
    } catch (error) {
      this.updateState({
        error: this.toErrorMessage(error)
      })
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async parseLink(request: ParseLinkRequest): Promise<IpcResponse<BilibiliParsedLink>> {
    const parsedInput = parseBilibiliLink(request.url)
    if (!parsedInput) {
      this.itemPlaybackTargets.clear()
      this.playPayloads.clear()
      this.updateState({
        parsedLink: null,
        selection: { exportMode: null },
        streamOptionSummary: null,
        taskStage: 'idle',
        error: 'Unsupported Bilibili link'
      })
      return {
        success: false,
        error: 'Unsupported Bilibili link'
      }
    }

    if (!this.fetchImpl) {
      this.updateState({
        taskStage: 'idle',
        error: 'Fetch is not available'
      })
      return {
        success: false,
        error: 'Fetch is not available'
      }
    }

    this.itemPlaybackTargets.clear()
    this.playPayloads.clear()
    this.updateState({
      taskStage: 'parsing',
      error: null
    })

    try {
      const parsedLink =
        parsedInput.kind === 'video'
          ? await this.loadVideoMetadata(parsedInput)
          : await this.loadBangumiMetadata(parsedInput)

      this.updateState({
        parsedLink,
        selection: { exportMode: null },
        streamOptionSummary: null,
        taskStage: 'idle',
        error: null
      })
      return {
        success: true,
        data: parsedLink
      }
    } catch (error) {
      this.itemPlaybackTargets.clear()
      this.playPayloads.clear()
      this.updateState({
        parsedLink: null,
        selection: { exportMode: null },
        streamOptionSummary: null,
        taskStage: 'failed',
        error: this.toErrorMessage(error)
      })
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async loadStreamOptions(request: LoadStreamOptionsRequest): Promise<IpcResponse<LoadStreamOptionsPayload>> {
    if (!this.state.parsedLink) {
      this.updateState({
        taskStage: 'idle',
        error: 'Parse a Bilibili link before loading stream options'
      })
      return {
        success: false,
        error: 'Parse a Bilibili link before loading stream options'
      }
    }

    if (this.state.parsedLink.kind !== request.kind) {
      this.updateState({
        taskStage: 'idle',
        error: 'Selected item does not match the parsed link type'
      })
      return {
        success: false,
        error: 'Selected item does not match the parsed link type'
      }
    }

    const selectedItem = this.state.parsedLink.items.find((item) => item.id === request.itemId)
    if (!selectedItem) {
      this.updateState({
        taskStage: 'idle',
        error: 'Selected item was not found in parsed link metadata'
      })
      return {
        success: false,
        error: 'Selected item was not found in parsed link metadata'
      }
    }

    if (!this.fetchImpl) {
      this.updateState({
        taskStage: 'idle',
        error: 'Fetch is not available'
      })
      return {
        success: false,
        error: 'Fetch is not available'
      }
    }

    this.updateState({
      taskStage: 'loading-stream-options',
      error: null
    })

    try {
      const playPayload = await this.loadPlayInfo(this.state.parsedLink, request.itemId)
      const summary = this.buildSummaryFromPlayPayload(playPayload)
      const qnOptions = this.normalizeStreamOptions(playPayload)
      const nextParsedLink = {
        ...this.state.parsedLink,
        selectedItemId: request.itemId
      } as BilibiliParsedLink

      const result: LoadStreamOptionsPayload = {
        itemId: request.itemId,
        qnOptions,
        summary
      }

      this.playPayloads.set(request.itemId, playPayload)

      this.updateState({
        parsedLink: nextParsedLink,
        selection: { exportMode: null },
        streamOptionSummary: summary,
        taskStage: 'idle',
        error: null
      })

      return {
        success: true,
        data: result
      }
    } catch (error) {
      this.updateState({
        taskStage: 'failed',
        error: this.toErrorMessage(error)
      })
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    }
  }

  async startDownload(request: StartDownloadRequest): Promise<IpcResponse<StartDownloadPayload>> {
    const exportMode = request.exportMode
    if (!this.state.parsedLink || !this.state.streamOptionSummary) {
      this.updateState({
        taskStage: 'idle',
        error: 'Load stream options before starting a download'
      })
      return {
        success: false,
        error: 'Load stream options before starting a download'
      }
    }

    if (!exportMode) {
      this.updateState({
        taskStage: 'idle',
        error: 'Select an export mode before starting a download'
      })
      return {
        success: false,
        error: 'Select an export mode before starting a download'
      }
    }

    if (this.activeDownloadTask) {
      this.updateState({
        error: 'A Bilibili download is already in progress'
      })
      return {
        success: false,
        error: 'A Bilibili download is already in progress'
      }
    }

    const modeAvailability = this.state.streamOptionSummary.exportModes[exportMode]
    if (!modeAvailability?.available) {
      const error = modeAvailability?.disabledReason ?? 'The selected export mode is unavailable'
      this.updateState({
        taskStage: 'idle',
        error
      })
      return {
        success: false,
        error
      }
    }

    const selectedItemId = this.state.parsedLink.selectedItemId
    const playPayload = this.playPayloads.get(selectedItemId)
    if (!playPayload) {
      this.updateState({
        taskStage: 'idle',
        error: 'Selected item is missing loaded stream options'
      })
      return {
        success: false,
        error: 'Selected item is missing loaded stream options'
      }
    }

    const tempDirectory = this.getTaskDirectory()
    const controller = new AbortController()
    this.activeDownloadTask = {
      controller,
      tempDirectory
    }

    const outputDirectory = request.outputDirectory ?? this.app.getPath('downloads')
    const headers = this.getRequestHeaders()
    const outputPaths: string[] = []
    let preserveTempArtifacts = false

    this.fs.mkdirSync(tempDirectory, { recursive: true })
    this.fs.mkdirSync(outputDirectory, { recursive: true })
    this.updateState({
      selection: { exportMode },
      error: null
    })

    try {
      const resources = this.resolveDashResources(playPayload)
      const videoTempPath = path.join(tempDirectory, VIDEO_TRACK_FILE_NAME)
      const audioTempPath = path.join(tempDirectory, AUDIO_TRACK_FILE_NAME)

      if (exportMode === 'video-only' || exportMode === 'split-streams' || exportMode === 'merge-mp4') {
        if (!resources.videoUrl) {
          throw new Error('Selected stream is missing a video resource')
        }

        this.setTaskStage('downloading-video')
        await this.downloadBinaryImpl({
          url: resources.videoUrl,
          destinationPath: videoTempPath,
          signal: controller.signal,
          headers
        })
      }

      if (exportMode === 'audio-only' || exportMode === 'split-streams' || exportMode === 'merge-mp4') {
        if (!resources.audioUrl) {
          throw new Error('Selected stream is missing an audio resource')
        }

        this.setTaskStage('downloading-audio')
        await this.downloadBinaryImpl({
          url: resources.audioUrl,
          destinationPath: audioTempPath,
          signal: controller.signal,
          headers
        })
      }

      if (exportMode === 'merge-mp4') {
        preserveTempArtifacts = true
        const ffmpegPath = this.getFfmpegPathImpl()
        if (!ffmpegPath) {
          throw new Error('FFmpeg is not available')
        }

        const mergedOutputPath = path.join(outputDirectory, `${this.getOutputBaseName()}.mp4`)
        this.removeExistingFileIfPresent(mergedOutputPath)
        this.setTaskStage('merging')

        try {
          await this.runFfmpegImpl({
            ffmpegPath,
            videoPath: videoTempPath,
            audioPath: audioTempPath,
            outputPath: mergedOutputPath
          })
        } catch (error) {
          throw error
        }

        outputPaths.push(mergedOutputPath)
      } else if (exportMode === 'video-only') {
        const finalPath = path.join(outputDirectory, `${this.getOutputBaseName()}.video${this.getExtensionFromUrl(resources.videoUrl)}`)
        this.moveFile(videoTempPath, finalPath)
        outputPaths.push(finalPath)
      } else if (exportMode === 'audio-only') {
        const finalPath = path.join(outputDirectory, `${this.getOutputBaseName()}.audio${this.getExtensionFromUrl(resources.audioUrl)}`)
        this.moveFile(audioTempPath, finalPath)
        outputPaths.push(finalPath)
      } else if (exportMode === 'split-streams') {
        const finalVideoPath = path.join(outputDirectory, `${this.getOutputBaseName()}.video${this.getExtensionFromUrl(resources.videoUrl)}`)
        const finalAudioPath = path.join(outputDirectory, `${this.getOutputBaseName()}.audio${this.getExtensionFromUrl(resources.audioUrl)}`)
        this.moveFile(videoTempPath, finalVideoPath)
        this.moveFile(audioTempPath, finalAudioPath)
        outputPaths.push(finalVideoPath, finalAudioPath)
      }

      await this.cleanupTaskDirectory(tempDirectory)
      this.setTaskStage('completed')
      this.updateState({ error: null })
      return {
        success: true,
        data: {
          outputPaths,
          tempDirectory
        }
      }
    } catch (error) {
      const cancelled = this.isAbortError(error) || controller.signal.aborted
      if (cancelled) {
        await this.cleanupTaskDirectory(tempDirectory)
        this.setTaskStage('cancelled')
        this.updateState({ error: null })
        return {
          success: false,
          error: 'Download cancelled'
        }
      }

      if (!preserveTempArtifacts) {
        await this.cleanupTaskDirectory(tempDirectory)
      }

      this.setTaskStage('failed')
      this.updateState({
        error: this.toErrorMessage(error)
      })
      return {
        success: false,
        error: this.toErrorMessage(error)
      }
    } finally {
      this.activeDownloadTask = null
    }
  }

  cancelDownload(): IpcResponse {
    if (!this.activeDownloadTask) {
      return {
        success: false,
        error: 'No Bilibili download is in progress'
      }
    }

    this.activeDownloadTask.controller.abort()
    return { success: true }
  }

  private getSessionPath() {
    return path.join(this.app.getPath('userData'), SESSION_FILE_NAME)
  }

  private async loadVideoMetadata(parsedInput: Extract<BilibiliParsedLink, { kind: 'video' }>) {
    const url = new URL(BILIBILI_VIDEO_VIEW_URL)
    url.searchParams.set('bvid', parsedInput.bvid)

    const payload = await this.fetchJson(url.toString())
    const data = payload?.data ?? payload
    const pages = Array.isArray(data?.pages) ? data.pages : []
    const requestedPage = parsedInput.page ?? 1
    const normalizedItems = pages.length > 0
      ? pages.map((pageEntry: any) => {
          const page = normalizePositiveNumber(pageEntry?.page) ?? 1
          const item = {
            kind: 'page' as const,
            page,
            title: normalizeText(pageEntry?.part) ?? `P${page}`
          }
          this.itemPlaybackTargets.set(`page:${page}`, {
            cid: normalizePositiveNumber(pageEntry?.cid),
            page
          })
          return item
        })
      : parsedInput.items.map((item) => {
          this.itemPlaybackTargets.set(item.id, {
            cid: null,
            page: item.page
          })
          return item
        })

    const selectedPage = normalizedItems.some((item) => item.page === requestedPage)
      ? requestedPage
      : normalizedItems[0]?.page ?? requestedPage

    return normalizeBilibiliParsedLink({
      kind: 'video',
      bvid: parsedInput.bvid,
      page: selectedPage,
      title: normalizeText(data?.title),
      coverUrl: normalizeText(data?.pic),
      items: normalizedItems,
      selectedItemId: `page:${selectedPage}`
    })
  }

  private async loadBangumiMetadata(parsedInput: Exclude<BilibiliParsedLink, { kind: 'video' }>) {
    const url = new URL(BILIBILI_BANGUMI_SEASON_URL)
    const selectedEpisodeId = parsedInput.kind === 'episode' ? parseNumericId(parsedInput.epId, 'ep') : null
    const selectedSeasonId = parsedInput.kind === 'season' ? parseNumericId(parsedInput.seasonId, 'ss') : null

    if (selectedEpisodeId) {
      url.searchParams.set('ep_id', selectedEpisodeId)
    } else if (selectedSeasonId) {
      url.searchParams.set('season_id', selectedSeasonId)
    }

    const payload = await this.fetchJson(url.toString())
    const data = payload?.result ?? payload?.data ?? payload
    const episodes = Array.isArray(data?.episodes) ? data.episodes : []
    const episodeItems = episodes.length > 0
      ? episodes.map((episode: any) => {
          const epId = `ep${episode?.id}`
          const item = {
            kind: 'episode' as const,
            epId,
            title: buildItemTitle(episode?.title, episode?.long_title, `EP ${epId}`)
          }
          this.itemPlaybackTargets.set(`episode:${epId}`, {
            cid: normalizePositiveNumber(episode?.cid),
            epId
          })
          return item
        })
      : []

    if (parsedInput.kind === 'episode') {
      const items = episodeItems.length > 0 ? episodeItems : parsedInput.items

      const selectedItemId = items.some((item) => item.epId === parsedInput.epId)
        ? `episode:${parsedInput.epId}`
        : items[0]?.id ?? `episode:${parsedInput.epId}`

      return normalizeBilibiliParsedLink({
        kind: 'episode',
        epId: parsedInput.epId,
        title: normalizeText(data?.season_title) ?? normalizeText(data?.title),
        coverUrl: normalizeText(data?.cover),
        items,
        selectedItemId
      })
    }

    if (episodeItems.length > 0) {
      const defaultEpisode = episodeItems[0]
      return normalizeBilibiliParsedLink({
        kind: 'episode',
        epId: defaultEpisode.epId,
        title: normalizeText(data?.season_title) ?? normalizeText(data?.title),
        coverUrl: normalizeText(data?.cover),
        items: episodeItems,
        selectedItemId: defaultEpisode.id
      })
    }

    const seasonItem = {
      kind: 'season' as const,
      seasonId: parsedInput.seasonId,
      title: normalizeText(data?.season_title) ?? normalizeText(data?.title) ?? `SS ${parsedInput.seasonId}`
    }
    const firstEpisode = episodes[0]
    this.itemPlaybackTargets.set(`season:${parsedInput.seasonId}`, {
      cid: normalizePositiveNumber(firstEpisode?.cid),
      epId: firstEpisode ? `ep${firstEpisode.id}` : undefined,
      seasonId: parsedInput.seasonId
    })

    return normalizeBilibiliParsedLink({
      kind: 'season',
      seasonId: parsedInput.seasonId,
      title: normalizeText(data?.season_title) ?? normalizeText(data?.title),
      coverUrl: normalizeText(data?.cover),
      items: [seasonItem],
      selectedItemId: `season:${parsedInput.seasonId}`
    })
  }

  private async loadPlayInfo(parsedLink: BilibiliParsedLink, itemId: string) {
    const target = this.itemPlaybackTargets.get(itemId)
    if (!target?.cid) {
      throw new Error('Selected item is missing playback metadata')
    }

    const url = new URL(parsedLink.kind === 'video' ? BILIBILI_VIDEO_PLAY_URL : BILIBILI_BANGUMI_PLAY_URL)

    if (parsedLink.kind === 'video') {
      url.searchParams.set('bvid', parsedLink.bvid)
    } else if (parsedLink.kind === 'episode') {
      const epId = parseNumericId(target.epId ?? parsedLink.epId, 'ep')
      if (!epId) {
        throw new Error('Selected episode is missing ep_id')
      }
      url.searchParams.set('ep_id', epId)
    } else {
      const epId = parseNumericId(target.epId, 'ep')
      if (epId) {
        url.searchParams.set('ep_id', epId)
      } else {
        const seasonId = parseNumericId(target.seasonId ?? parsedLink.seasonId, 'ss')
        if (!seasonId) {
          throw new Error('Selected season is missing season_id')
        }
        url.searchParams.set('season_id', seasonId)
      }
    }

    url.searchParams.set('cid', String(target.cid))
    url.searchParams.set('fnval', String(DEFAULT_FNVAL))
    url.searchParams.set('qn', String(DEFAULT_STREAM_QN))
    url.searchParams.set('fourk', '1')

    const payload = await this.fetchJson(url.toString())
    return payload?.result ?? payload?.data ?? payload
  }

  private normalizeStreamOptions(playPayload: any): StreamOption[] {
    const qualityList = Array.isArray(playPayload?.accept_quality) ? playPayload.accept_quality : []
    const descriptions = Array.isArray(playPayload?.accept_description) ? playPayload.accept_description : []
    const supportFormats = Array.isArray(playPayload?.support_formats) ? playPayload.support_formats : []
    const seen = new Set<number>()
    const options: StreamOption[] = []

    const addOption = (qnValue: unknown, labelValue: unknown, selected: boolean) => {
      const qn = normalizePositiveNumber(qnValue)
      if (!qn || seen.has(qn)) {
        return
      }

      seen.add(qn)
      options.push({
        qn,
        label: normalizeText(labelValue) ?? `${qn}P`,
        selected,
        available: true
      })
    }

    qualityList.forEach((qn: unknown, index: number) => {
      const format = supportFormats.find((item: any) => normalizePositiveNumber(item?.quality) === normalizePositiveNumber(qn))
      addOption(qn, format?.new_description ?? format?.display_desc ?? descriptions[index], index === 0)
    })

    if (options.length === 0) {
      supportFormats.forEach((item: any, index: number) => {
        addOption(item?.quality, item?.new_description ?? item?.display_desc, index === 0)
      })
    }

    return options
  }

  private buildSummaryFromPlayPayload(playPayload: any) {
    const dash = playPayload?.dash ?? {}
    const videos = Array.isArray(dash.video) ? dash.video : []
    const audios = Array.isArray(dash.audio) ? dash.audio : []
    return buildStreamOptionSummary({
      hasAudio: audios.length > 0,
      hasVideo: videos.length > 0
    })
  }

  private getTaskDirectory() {
    return path.join(this.app.getPath('userData'), TASK_ROOT_DIRECTORY_NAME, TASKS_DIRECTORY_NAME, String(this.now()))
  }

  private getOutputBaseName() {
    const parsedLink = this.state.parsedLink
    if (!parsedLink) {
      return 'bilibili-download'
    }

    const selectedItem = parsedLink.items.find((item) => item.id === parsedLink.selectedItemId)
    const parts = [parsedLink.title, selectedItem?.title].filter((value) => normalizeText(value))
    const rawBaseName = parts.length > 0 ? parts.join(' - ') : 'bilibili-download'
    return rawBaseName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  }

  private getExtensionFromUrl(url: string | null) {
    if (!url) {
      return '.bin'
    }

    try {
      const pathname = new URL(url).pathname
      const extension = path.extname(pathname)
      return extension || '.bin'
    } catch {
      return '.bin'
    }
  }

  private resolveDashResources(playPayload: any) {
    const dash = playPayload?.dash ?? {}
    const firstVideo = (Array.isArray(dash.video) ? dash.video : [])[0] as DashResource | undefined
    const firstAudio = (Array.isArray(dash.audio) ? dash.audio : [])[0] as DashResource | undefined

    return {
      videoUrl: this.getResourceUrl(firstVideo),
      audioUrl: this.getResourceUrl(firstAudio)
    }
  }

  private getResourceUrl(resource: DashResource | undefined) {
    if (!resource) {
      return null
    }

    const primary = normalizeText(resource.baseUrl ?? resource.base_url)
    if (primary) {
      return primary
    }

    const backupList = Array.isArray(resource.backupUrl)
      ? resource.backupUrl
      : Array.isArray(resource.backup_url)
        ? resource.backup_url
        : []

    for (const candidate of backupList) {
      const normalized = normalizeText(candidate)
      if (normalized) {
        return normalized
      }
    }

    return null
  }

  private async fetchJson(url: string) {
    if (!this.fetchImpl) {
      throw new Error('Fetch is not available')
    }

    const response = await this.fetchImpl(url, {
      headers: this.getRequestHeaders()
    })
    const payload = await response.json()
    const code = Number(payload?.code ?? 0)

    if (Number.isFinite(code) && code !== 0) {
      throw new Error(normalizeText(payload?.message) ?? 'Bilibili request failed')
    }

    return payload
  }

  private getRequestHeaders(): Record<string, string> {
    if (!this.authSession) {
      return {}
    }

    return {
      cookie: `SESSDATA=${this.authSession.sessData}; bili_jct=${this.authSession.biliJct}`
    }
  }

  private async persistSession(session: PersistedSessionRecord) {
    const sessionPath = this.getSessionPath()
    const sessionDirectory = path.dirname(sessionPath)

    this.fs.mkdirSync(sessionDirectory, { recursive: true })
    await this.fs.promises.writeFile(sessionPath, JSON.stringify(session, null, 2))
  }

  private clearPersistedSession() {
    const sessionPath = this.getSessionPath()
    if (this.fs.existsSync(sessionPath)) {
      this.fs.unlinkSync(sessionPath)
    }
  }

  private updateState(patch: Partial<BilibiliDownloaderState>) {
    const nextState = {
      ...this.state,
      ...patch,
      loginSession: patch.loginSession ?? this.state.loginSession,
      selection: patch.selection ?? this.state.selection
    }
    const changed = JSON.stringify(nextState) !== JSON.stringify(this.state)
    this.state = nextState

    if (!changed) {
      return
    }

    const snapshot = this.getState()
    for (const listener of this.stateListeners) {
      listener(snapshot)
    }
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message
    }

    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
      return String((error as { message: string }).message)
    }

    return String(error)
  }

  private setTaskStage(stage: BilibiliDownloaderState['taskStage']) {
    this.updateState({
      taskStage: stage
    })
  }

  private removeExistingFileIfPresent(filePath: string) {
    if (this.fs.existsSync(filePath)) {
      this.fs.unlinkSync(filePath)
    }
  }

  private moveFile(fromPath: string, toPath: string) {
    this.removeExistingFileIfPresent(toPath)
    this.fs.renameSync(fromPath, toPath)
  }

  private async cleanupTaskDirectory(taskDirectory: string) {
    await this.fs.promises.rm(taskDirectory, {
      recursive: true,
      force: true
    })
  }

  private isAbortError(error: unknown) {
    const message = this.toErrorMessage(error).toLowerCase()
    return message === 'aborted' || message.includes('abort')
  }

  private async downloadBinary(input: DownloadBinaryInput) {
    if (!this.fetchImpl) {
      throw new Error('Fetch is not available')
    }

    const response = await this.fetchImpl(input.url, {
      headers: input.headers,
      signal: input.signal
    })

    if (typeof response.arrayBuffer !== 'function') {
      throw new Error('Binary downloads are not supported by the current fetch implementation')
    }

    const body = Buffer.from(await response.arrayBuffer())
    await this.fs.promises.writeFile(input.destinationPath, body)
  }

  private async runFfmpeg(input: RunFfmpegInput) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        input.ffmpegPath,
        [
          '-y',
          '-i',
          input.videoPath,
          '-i',
          input.audioPath,
          '-c',
          'copy',
          input.outputPath
        ],
        {
          windowsHide: true
        }
      )

      child.once('error', reject)
      child.once('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(`FFmpeg exited with code ${code ?? 'unknown'}`))
      })
    })
  }
}

export const bilibiliDownloaderService = new BilibiliDownloaderService()
