import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createDefaultBilibiliDownloaderState } from '../../shared/bilibiliDownloader.ts'
import type { BilibiliDownloaderState, BilibiliLoginSession, IpcResponse } from '../../shared/types.ts'

const QR_BOOTSTRAP_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate'
const QR_POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll'
const SESSION_FILE_NAME = 'bilibili-downloader-session.json'

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{
  ok?: boolean
  status?: number
  json: () => Promise<any>
}>

type AppLike = Pick<typeof app, 'getPath'>

type FsLike = Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'readFileSync' | 'unlinkSync'> & {
  promises: Pick<typeof fs.promises, 'writeFile'>
}

type BilibiliDownloaderServiceDependencies = {
  app?: AppLike
  fs?: FsLike
  fetch?: FetchLike
  now?: () => number
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
  auth: BilibiliAuthSession
}

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
  if (!isValidLoginSession(record.loginSession) || !record.loginSession.isLoggedIn || !isValidAuthSession(record.auth)) {
    return null
  }

  return {
    loginSession: record.loginSession,
    auth: record.auth
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

export class BilibiliDownloaderService {
  private readonly app: AppLike
  private readonly fs: FsLike
  private readonly fetchImpl: FetchLike | null
  private readonly now: () => number
  private readonly stateListeners = new Set<StateListener>()

  private state: BilibiliDownloaderState = createDefaultBilibiliDownloaderState()
  private authSession: BilibiliAuthSession | null = null
  private pendingAuthCode: string | null = null

  constructor(dependencies: BilibiliDownloaderServiceDependencies = {}) {
    this.app = dependencies.app ?? app
    this.fs = dependencies.fs ?? fs
    this.fetchImpl = dependencies.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null)
    this.now = dependencies.now ?? (() => Date.now())
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
      if (!persisted || !persisted.auth) {
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
        await this.persistSession(confirmedSession)
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

  private getSessionPath() {
    return path.join(this.app.getPath('userData'), SESSION_FILE_NAME)
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
    return error instanceof Error ? error.message : String(error)
  }
}

export const bilibiliDownloaderService = new BilibiliDownloaderService()
