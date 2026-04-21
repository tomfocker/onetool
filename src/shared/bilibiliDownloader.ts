import type {
  BilibiliParsedEpisodeItem,
  BilibiliParsedEpisodeLink,
  BilibiliDownloadStage,
  BilibiliDownloaderSelection,
  BilibiliDownloaderState,
  BilibiliExportMode,
  BilibiliLinkKind,
  BilibiliLoginSession,
  BilibiliParsedItem,
  BilibiliParsedPageItem,
  BilibiliParsedSeasonItem,
  BilibiliParsedSeasonLink,
  BilibiliParsedVideoLink,
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
  'cancelled',
  'completed',
  'failed'
] as const

type BilibiliParsedPageItemInput = {
  id?: string | null
  kind?: 'page' | null
  title?: string | null
  page?: number | null
}

type BilibiliParsedEpisodeItemInput = {
  id?: string | null
  kind?: 'episode' | null
  title?: string | null
  epId?: string | null
}

type BilibiliParsedSeasonItemInput = {
  id?: string | null
  kind?: 'season' | null
  title?: string | null
  seasonId?: string | null
}

type BilibiliParsedItemInput =
  | BilibiliParsedPageItemInput
  | BilibiliParsedEpisodeItemInput
  | BilibiliParsedSeasonItemInput
  | null
  | undefined

type BaseParsedLinkInput = {
  title?: string | null
  coverUrl?: string | null
  selectedItemId?: string | null
}

type BilibiliParsedVideoLinkInput = BaseParsedLinkInput & {
  kind?: 'video'
  bvid?: string | null
  page?: number | null
  items?: BilibiliParsedPageItemInput[]
}

type BilibiliParsedEpisodeLinkInput = BaseParsedLinkInput & {
  kind: 'episode'
  epId?: string | null
  items?: BilibiliParsedEpisodeItemInput[]
}

type BilibiliParsedSeasonLinkInput = BaseParsedLinkInput & {
  kind: 'season'
  seasonId?: string | null
  items?: BilibiliParsedSeasonItemInput[]
}

type BilibiliParsedLinkInput =
  | BilibiliParsedVideoLinkInput
  | BilibiliParsedEpisodeLinkInput
  | BilibiliParsedSeasonLinkInput
type BilibiliDownloaderSelectionInput = Partial<Pick<BilibiliDownloaderSelection, 'exportMode'>> | null | undefined

type StreamSummaryInput = {
  hasAudio: boolean
  hasVideo: boolean
}

type ParsedItemIdentityInput = {
  kind: BilibiliParsedItemKind
  id?: string | null
  title?: string | null
  page?: number | null
  epId?: string | null
  seasonId?: string | null
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

function isRealBilibiliHost(hostname: string) {
  return hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')
}

function normalizeParsedItemKind(value: BilibiliParsedItemKind | null | undefined, fallback: BilibiliParsedItemKind) {
  return value === 'page' || value === 'episode' || value === 'season' ? value : fallback
}

function buildParsedItemId(item: ParsedItemIdentityInput) {
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

function getExpectedItemKind(linkKind: BilibiliLinkKind): BilibiliParsedItemKind {
  if (linkKind === 'video') {
    return 'page'
  }

  if (linkKind === 'episode') {
    return 'episode'
  }

  return 'season'
}

function buildParsedItemTitle(item: ParsedItemIdentityInput) {
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
  if (kind === 'page' && typeof (input as BilibiliParsedPageItemInput | undefined)?.page !== 'number') {
    throw new Error('Page items must include a page number')
  }

  if (kind === 'episode' && !normalizeText((input as BilibiliParsedEpisodeItemInput | undefined)?.epId)) {
    throw new Error('Episode items must include epId')
  }

  if (kind === 'season' && !normalizeText((input as BilibiliParsedSeasonItemInput | undefined)?.seasonId)) {
    throw new Error('Season items must include seasonId')
  }

  const page = kind === 'page'
    ? normalizePositiveInteger((input as BilibiliParsedPageItemInput | undefined)?.page, 1)
    : null
  const epId = kind === 'episode'
    ? normalizeText((input as BilibiliParsedEpisodeItemInput | undefined)?.epId) || null
    : null
  const seasonId = kind === 'season'
    ? normalizeText((input as BilibiliParsedSeasonItemInput | undefined)?.seasonId) || null
    : null

  if (kind === 'page') {
    return {
      id: buildParsedItemId({ ...input, kind }),
      kind,
      title: buildParsedItemTitle({ ...input, kind }),
      page: page as number
    }
  }

  if (kind === 'episode') {
    return {
      id: buildParsedItemId({ ...input, kind }),
      kind,
      title: buildParsedItemTitle({ ...input, kind }),
      epId: epId as string
    }
  }

  return {
    id: buildParsedItemId({ ...input, kind }),
    kind,
    title: buildParsedItemTitle({ ...input, kind }),
    seasonId: seasonId as string
  }
}

function buildDefaultSelectableItems(input: BilibiliParsedLinkInput): BilibiliParsedItem[] {
  const kind = input.kind ?? 'video'
  const expectedItemKind = getExpectedItemKind(kind)

  if (kind === 'video') {
    const videoInput = input as BilibiliParsedVideoLinkInput
    const bvid = normalizeText(videoInput.bvid)
    if (!bvid) {
      throw new Error('Video links must include bvid')
    }

    const page = normalizePositiveInteger(videoInput.page, 1)
    return [
      normalizeBilibiliParsedItem(
        {
          kind: expectedItemKind,
          page,
          title: `P${page}`
        },
        expectedItemKind
      )
    ]
  }

  if (kind === 'episode') {
    const episodeInput = input as BilibiliParsedEpisodeLinkInput
    const epId = normalizeText(episodeInput.epId)
    if (!epId) {
      throw new Error('Episode links must include epId')
    }

    return [
      normalizeBilibiliParsedItem(
        {
          kind: expectedItemKind,
          epId,
          title: `EP ${epId}`
        },
        expectedItemKind
      )
    ]
  }

  const seasonInput = input as BilibiliParsedSeasonLinkInput
  const seasonId = normalizeText(seasonInput.seasonId)
  if (!seasonId) {
    throw new Error('Season links must include seasonId')
  }

  return [
    normalizeBilibiliParsedItem(
      {
        kind: expectedItemKind,
        seasonId,
        title: `SS ${seasonId}`
      },
      expectedItemKind
    )
  ]
}

export function normalizeBilibiliParsedLink(input: BilibiliParsedLinkInput): BilibiliParsedLink {
  const kind: BilibiliLinkKind = input?.kind ?? 'video'
  const expectedItemKind = getExpectedItemKind(kind)
  const videoInput = kind === 'video' ? input as BilibiliParsedVideoLinkInput : null
  const episodeInput = kind === 'episode' ? input as BilibiliParsedEpisodeLinkInput : null
  const seasonInput = kind === 'season' ? input as BilibiliParsedSeasonLinkInput : null
  const bvid = videoInput ? normalizeText(videoInput.bvid) : ''
  const epId = episodeInput ? normalizeText(episodeInput.epId) : ''
  const seasonId = seasonInput ? normalizeText(seasonInput.seasonId) : ''

  if (kind === 'video' && !bvid) {
    throw new Error('Video links must include bvid')
  }

  if (kind === 'episode' && !epId) {
    throw new Error('Episode links must include epId')
  }

  if (kind === 'season' && !seasonId) {
    throw new Error('Season links must include seasonId')
  }

  const rawItems = input.items ?? []
  const items =
    rawItems.length > 0
      ? rawItems.map((item) => {
          const itemKind = normalizeParsedItemKind(item?.kind, expectedItemKind)
          if (itemKind !== expectedItemKind) {
            throw new Error('Selectable parsed items must match the link type')
          }

          return normalizeBilibiliParsedItem(item, expectedItemKind)
        })
      : buildDefaultSelectableItems(input)

  if (items.length === 0) {
    throw new Error('Selectable parsed links must include at least one item')
  }

  const selectedItemId = normalizeText(input?.selectedItemId) || items[0]?.id || null
  if (!selectedItemId) {
    throw new Error('Selectable parsed links must include a selected item')
  }

  if (!items.some((item) => item.id === selectedItemId)) {
    throw new Error('Selected item must be one of the selectable items')
  }

  const title = normalizeText(input.title) || null
  const coverUrl = normalizeText(input.coverUrl) || null

  if (kind === 'video') {
    const page = typeof videoInput?.page === 'number' ? normalizePositiveInteger(videoInput.page, 1) : undefined
    return {
      kind,
      bvid,
      ...(typeof page === 'number' ? { page } : {}),
      title,
      coverUrl,
      items: items as BilibiliParsedPageItem[],
      selectedItemId
    } satisfies BilibiliParsedVideoLink
  }

  if (kind === 'episode') {
    return {
      kind,
      epId,
      title,
      coverUrl,
      items: items as BilibiliParsedEpisodeItem[],
      selectedItemId
    } satisfies BilibiliParsedEpisodeLink
  }

  return {
    kind,
    seasonId,
    title,
    coverUrl,
    items: items as BilibiliParsedSeasonItem[],
    selectedItemId
  } satisfies BilibiliParsedSeasonLink
}

export function parseBilibiliLink(input: string): BilibiliParsedLink | null {
  const url = parseBilibiliHost(input)

  if (!url || !isRealBilibiliHost(url.hostname)) {
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
      exportMode: null
    },
    streamOptionSummary: null,
    taskStage: 'idle',
    error: null
  }
}
