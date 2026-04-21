import type {
  BilibiliDownloadStage,
  BilibiliDownloaderSelection,
  BilibiliDownloaderState,
  BilibiliExportMode,
  BilibiliLinkKind,
  BilibiliLoginSession,
  BilibiliParsedItem,
  BilibiliParsedItemKind,
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

type BilibiliParsedItemInput = Partial<BilibiliParsedItem> | null | undefined
type BilibiliParsedLinkInput = Partial<Omit<BilibiliParsedLink, 'items'>> & {
  items?: BilibiliParsedItemInput[]
}
type BilibiliDownloaderSelectionInput = Partial<BilibiliDownloaderSelection> | null | undefined

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

function normalizeParsedItemKind(value: BilibiliParsedItemKind | null | undefined, fallback: BilibiliParsedItemKind) {
  return value === 'page' || value === 'episode' || value === 'season' ? value : fallback
}

function buildParsedItemId(item: Pick<BilibiliParsedItem, 'kind'> & Partial<BilibiliParsedItem>) {
  const explicitId = normalizeText(item.id)
  if (explicitId) {
    return explicitId
  }

  if (item.kind === 'page') {
    return `page:${normalizePositiveInteger(item.page, 1)}`
  }

  if (item.kind === 'episode') {
    return `episode:${normalizeText(item.epId)}`
  }

  return `season:${normalizeText(item.seasonId)}`
}

function buildParsedItemTitle(item: Pick<BilibiliParsedItem, 'kind'> & Partial<BilibiliParsedItem>) {
  const explicitTitle = normalizeText(item.title)
  if (explicitTitle) {
    return explicitTitle
  }

  if (item.kind === 'page') {
    return `P${normalizePositiveInteger(item.page, 1)}`
  }

  if (item.kind === 'episode') {
    return `EP ${normalizeText(item.epId)}`
  }

  return `SS ${normalizeText(item.seasonId)}`
}

export function normalizeBilibiliParsedItem(
  input: BilibiliParsedItemInput,
  fallbackKind: BilibiliParsedItemKind = 'page'
): BilibiliParsedItem {
  const kind = normalizeParsedItemKind(input?.kind, fallbackKind)
  const page = typeof input?.page === 'number' ? normalizePositiveInteger(input.page, 1) : undefined
  const epId = normalizeText(input?.epId) || undefined
  const seasonId = normalizeText(input?.seasonId) || undefined
  const item: BilibiliParsedItem = {
    id: buildParsedItemId({ ...input, kind }),
    kind,
    title: buildParsedItemTitle({ ...input, kind })
  }

  if (typeof page === 'number') {
    item.page = page
  }

  if (epId) {
    item.epId = epId
  }

  if (seasonId) {
    item.seasonId = seasonId
  }

  return item
}

export function normalizeBilibiliParsedLink(input: BilibiliParsedLinkInput): BilibiliParsedLink {
  const kind: BilibiliLinkKind = input?.kind ?? 'video'
  const items = (input?.items ?? []).map((item) =>
    normalizeBilibiliParsedItem(
      item,
      kind === 'video' ? 'page' : kind === 'episode' ? 'episode' : 'season'
    )
  )
  const selectedItemId = normalizeText(input?.selectedItemId) || items[0]?.id || null
  const parsedLink: BilibiliParsedLink = {
    kind,
    title: normalizeText(input?.title) || null,
    coverUrl: normalizeText(input?.coverUrl) || null,
    items,
    selectedItemId
  }

  const bvid = normalizeText(input?.bvid)
  const epId = normalizeText(input?.epId)
  const seasonId = normalizeText(input?.seasonId)
  const page = typeof input?.page === 'number' ? normalizePositiveInteger(input.page, 1) : undefined

  if (bvid) {
    parsedLink.bvid = bvid
  }

  if (epId) {
    parsedLink.epId = epId
  }

  if (seasonId) {
    parsedLink.seasonId = seasonId
  }

  if (typeof page === 'number') {
    parsedLink.page = page
  }

  return parsedLink
}

export function parseBilibiliLink(input: string): BilibiliParsedLink | null {
  const url = parseBilibiliHost(input)

  if (!url || !url.hostname.includes('bilibili.com')) {
    return null
  }

  const videoMatch = url.pathname.match(BILIBILI_VIDEO_REGEX)

  if (videoMatch?.[1]) {
    const page = normalizePositiveInteger(url.searchParams.get('p'), 1)
    return normalizeBilibiliParsedLink({
      kind: 'video',
      bvid: videoMatch[1],
      page,
      items: [
        {
          kind: 'page',
          page,
          title: `P${page}`
        }
      ]
    })
  }

  const episodeMatch = url.pathname.match(BILIBILI_BANGUMI_EP_REGEX)

  if (episodeMatch?.[1]) {
    return normalizeBilibiliParsedLink({
      kind: 'episode',
      epId: episodeMatch[1],
      items: [
        {
          kind: 'episode',
          epId: episodeMatch[1],
          title: `EP ${episodeMatch[1]}`
        }
      ]
    })
  }

  const seasonMatch = url.pathname.match(BILIBILI_BANGUMI_SS_REGEX)

  if (seasonMatch?.[1]) {
    return normalizeBilibiliParsedLink({
      kind: 'season',
      seasonId: seasonMatch[1],
      items: [
        {
          kind: 'season',
          seasonId: seasonMatch[1],
          title: `SS ${seasonMatch[1]}`
        }
      ]
    })
  }

  return null
}

function normalizeStage(stage: BilibiliDownloadStage | null | undefined): BilibiliDownloadStage {
  return BILIBILI_DOWNLOAD_STAGE_VALUES.includes(stage as BilibiliDownloadStage)
    ? (stage as BilibiliDownloadStage)
    : 'idle'
}

function normalizeExportMode(exportMode: BilibiliExportMode | null | undefined): BilibiliExportMode | null {
  return BILIBILI_EXPORT_MODE_VALUES.includes(exportMode as BilibiliExportMode)
    ? (exportMode as BilibiliExportMode)
    : null
}

export function normalizeBilibiliDownloaderSelection(
  input: BilibiliDownloaderSelectionInput
): BilibiliDownloaderSelection {
  return {
    selectedItemId: normalizeText(input?.selectedItemId) || null,
    exportMode: normalizeExportMode(input?.exportMode)
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
    selection: {
      selectedItemId: null,
      exportMode: null
    },
    streamOptionSummary: null,
    taskStage: 'idle',
    error: null
  }
}
