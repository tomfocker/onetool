import type {
  BilibiliDownloadItem,
  BilibiliDownloadStage,
  BilibiliDownloaderState,
  BilibiliExportMode,
  BilibiliLinkKind,
  BilibiliLoginSession,
  BilibiliParsedLink,
  BilibiliStreamModeAvailability,
  BilibiliStreamOptionSummary
} from './types.ts'

export const BILIBILI_EXPORT_MODE_VALUES = [
  'video-only',
  'audio-only',
  'split-streams',
  'merge-mp4'
] as const

export const BILIBILI_DOWNLOAD_STAGE_VALUES = [
  'idle',
  'parsing',
  'loading-stream-options',
  'downloading-video',
  'downloading-audio',
  'merging',
  'completed',
  'failed'
] as const

type BilibiliDownloadItemInput = Partial<BilibiliDownloadItem> | null | undefined

type StreamSummaryInput = {
  hasAudio: boolean
  hasVideo: boolean
}

const BILIBILI_VIDEO_REGEX = /\/video\/(BV[0-9A-Za-z]+)/i
const BILIBILI_BANGUMI_EP_REGEX = /\/bangumi\/play\/(ep\d+)/i
const BILIBILI_BANGUMI_SS_REGEX = /\/bangumi\/play\/(ss\d+)/i
const MP4_MERGE_DISABLED_REASON = 'MP4 合并需要同时具备音频和视频流'

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numberValue)) {
    return fallback
  }

  const normalized = Math.trunc(numberValue)
  return normalized > 0 ? normalized : fallback
}

function createModeAvailability(available: boolean, disabledReason: string | null): BilibiliStreamModeAvailability {
  return {
    available,
    disabledReason: available ? null : disabledReason
  }
}

function getExportModesFromAvailability(summary: Pick<BilibiliStreamOptionSummary, 'exportModes'>) {
  return BILIBILI_EXPORT_MODE_VALUES.filter((mode) => summary.exportModes[mode].available)
}

function parseBilibiliHost(rawInput: string) {
  const trimmed = rawInput.trim()

  if (!trimmed) {
    return null
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    return new URL(withProtocol)
  } catch {
    return null
  }
}

export function parseBilibiliLink(input: string): BilibiliParsedLink | null {
  const url = parseBilibiliHost(input)

  if (!url || !url.hostname.includes('bilibili.com')) {
    return null
  }

  const videoMatch = url.pathname.match(BILIBILI_VIDEO_REGEX)

  if (videoMatch?.[1]) {
    const page = normalizePositiveInteger(url.searchParams.get('p'), 1)
    return {
      kind: 'video',
      bvid: videoMatch[1],
      page
    }
  }

  const episodeMatch = url.pathname.match(BILIBILI_BANGUMI_EP_REGEX)

  if (episodeMatch?.[1]) {
    return {
      kind: 'episode',
      epId: episodeMatch[1]
    }
  }

  const seasonMatch = url.pathname.match(BILIBILI_BANGUMI_SS_REGEX)

  if (seasonMatch?.[1]) {
    return {
      kind: 'season',
      seasonId: seasonMatch[1]
    }
  }

  return null
}

function normalizeStage(stage: BilibiliDownloadStage | null | undefined): BilibiliDownloadStage {
  return BILIBILI_DOWNLOAD_STAGE_VALUES.includes(stage as BilibiliDownloadStage)
    ? (stage as BilibiliDownloadStage)
    : 'idle'
}

function normalizeExportMode(exportMode: BilibiliExportMode | null | undefined): BilibiliExportMode {
  return BILIBILI_EXPORT_MODE_VALUES.includes(exportMode as BilibiliExportMode)
    ? (exportMode as BilibiliExportMode)
    : 'video-only'
}

export function normalizeBilibiliDownloadItem(input: BilibiliDownloadItemInput): BilibiliDownloadItem {
  const kind: BilibiliLinkKind = input?.kind ?? 'video'
  const page = normalizePositiveInteger(input?.page, 1)
  const id = normalizeText(input?.id)
  const title = normalizeText(input?.title) || '未命名'

  return {
    id: id || `${kind}:${page}`,
    title,
    kind,
    page,
    exportMode: normalizeExportMode(input?.exportMode),
    stage: normalizeStage(input?.stage)
  }
}

export function buildStreamOptionSummary(input: StreamSummaryInput): BilibiliStreamOptionSummary {
  const exportModes = {
    'video-only': createModeAvailability(input.hasVideo, '缺少视频流'),
    'audio-only': createModeAvailability(input.hasAudio, '缺少音频流'),
    'split-streams': createModeAvailability(
      input.hasAudio && input.hasVideo,
      '原始流分别下载需要同时具备音频和视频流'
    ),
    'merge-mp4': createModeAvailability(input.hasAudio && input.hasVideo, MP4_MERGE_DISABLED_REASON)
  } satisfies Record<BilibiliExportMode, BilibiliStreamModeAvailability>

  return {
    hasAudio: input.hasAudio,
    hasVideo: input.hasVideo,
    mergeMp4: exportModes['merge-mp4'],
    exportModes,
    availableExportModes: getExportModesFromAvailability({ exportModes })
  }
}

export function createDefaultBilibiliDownloaderState(): BilibiliDownloaderState {
  const loginSession: BilibiliLoginSession = {
    isLoggedIn: false,
    nickname: null,
    avatarUrl: null,
    expiresAt: null
  }

  return {
    loginSession,
    parsedLink: null,
    streamOptionSummary: null,
    downloadItem: null,
    taskStage: 'idle',
    error: null
  }
}
