import type { IpcResponse } from '../../shared/types'
import {
  buildMemoryDiaryTimelineInsight,
  buildMemoryDiaryWorkEvent,
  createDefaultMemoryDiaryStoredState,
  createMemoryDiaryBucketStart,
  filterMemoryDiaryItems,
  getAllowedMemoryDiaryContentTypes,
  type MemoryDiaryConfig,
  type MemoryDiaryEventOptimizationRequest,
  type MemoryDiaryContentType,
  type MemoryDiaryItem,
  type MemoryDiaryTimelineBucket
} from '../../shared/memoryDiary'
import { storeService } from './StoreService'
import { screenpipeClient, type ScreenpipeClient } from './ScreenpipeClient'
import { llmService } from './LlmService'

type StoreLike = Pick<typeof storeService, 'get'>
type EventOptimizerLike = {
  optimizeMemoryDiaryEvents(request: MemoryDiaryEventOptimizationRequest): Promise<IpcResponse<MemoryDiaryTimelineBucket[]>>
}
const TIMELINE_SUMMARY_MAX_LENGTH = 160
const TIMELINE_KEY_TEXT_MAX_LENGTH = 140
const TIMELINE_TEXT_SOURCE_PRIORITY: Record<MemoryDiaryContentType, number> = {
  accessibility: 0,
  audio: 1,
  input: 2,
  ocr: 3
}
type OptimizedBucketCacheEntry = {
  fingerprint: string
  bucket: MemoryDiaryTimelineBucket
}

export interface MemoryTimelineQuery {
  date: string
  timezone: string
}

export class MemoryTimelineService {
  private readonly client: Pick<ScreenpipeClient, 'search'>
  private readonly store: StoreLike
  private readonly eventOptimizer: EventOptimizerLike
  private readonly optimizedBucketCache = new Map<string, Map<string, OptimizedBucketCacheEntry>>()

  constructor(dependencies: {
    screenpipeClient?: Pick<ScreenpipeClient, 'search'>
    storeService?: StoreLike
    eventOptimizer?: EventOptimizerLike
  } = {}) {
    this.client = dependencies.screenpipeClient ?? screenpipeClient
    this.store = dependencies.storeService ?? storeService
    this.eventOptimizer = dependencies.eventOptimizer ?? llmService
  }

  async queryTimeline(request: MemoryTimelineQuery): Promise<IpcResponse<MemoryDiaryTimelineBucket[]>> {
    const state = {
      ...createDefaultMemoryDiaryStoredState(),
      ...(this.store.get('memoryDiary') || {})
    }
    const config = {
      ...createDefaultMemoryDiaryStoredState().config,
      ...state.config
    }
    const range = this.getLocalDateRange(request.date, request.timezone)
    const contentTypes = getAllowedMemoryDiaryContentTypes(config)
    const result = await this.client.search({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      startTime: range.start,
      endTime: range.end,
      contentTypes,
      limit: 3000
    })

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || '读取 ScreenPipe 时间线失败'
      }
    }

    const filtered = filterMemoryDiaryItems(result.data, config)
    const buckets = this.createBuckets(filtered, config.timelineBucketMinutes)
    const optimizationCacheKey = this.buildOptimizationCacheKey(request, config, contentTypes)
    return {
      success: true,
      data: await this.optimizeBucketsWithAi(
        request,
        buckets,
        config.aiEventOptimizationEnabled !== false,
        optimizationCacheKey
      )
    }
  }

  private async optimizeBucketsWithAi(
    request: MemoryTimelineQuery,
    buckets: MemoryDiaryTimelineBucket[],
    enabled: boolean,
    cacheKey: string
  ): Promise<MemoryDiaryTimelineBucket[]> {
    if (!enabled || buckets.length === 0) {
      return buckets
    }

    const cache = this.getOptimizationCache(cacheKey)
    const currentBucketIds = new Set(buckets.map((bucket) => bucket.id))
    const bucketsNeedingOptimization: MemoryDiaryTimelineBucket[] = []
    const bucketFingerprints = new Map<string, string>()
    for (const bucket of buckets) {
      const fingerprint = this.buildBucketFingerprint(bucket)
      bucketFingerprints.set(bucket.id, fingerprint)
      const cached = cache.get(bucket.id)
      if (cached?.fingerprint !== fingerprint) {
        bucketsNeedingOptimization.push(bucket)
      }
    }

    for (const bucketId of Array.from(cache.keys())) {
      if (!currentBucketIds.has(bucketId)) {
        cache.delete(bucketId)
      }
    }

    if (bucketsNeedingOptimization.length === 0) {
      return buckets.map((bucket) => cache.get(bucket.id)?.bucket ?? bucket)
    }

    try {
      const result = await this.eventOptimizer.optimizeMemoryDiaryEvents({
        date: request.date,
        timezone: request.timezone,
        buckets: bucketsNeedingOptimization
      })
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        const optimizedById = new Map(result.data.map((bucket) => [bucket.id, bucket] as const))
        for (const bucket of bucketsNeedingOptimization) {
          const optimizedBucket = optimizedById.get(bucket.id) ?? bucket
          cache.set(bucket.id, {
            fingerprint: bucketFingerprints.get(bucket.id) || this.buildBucketFingerprint(bucket),
            bucket: optimizedBucket
          })
        }
        return buckets.map((bucket) => cache.get(bucket.id)?.bucket ?? bucket)
      }
    } catch {
      return buckets.map((bucket) => cache.get(bucket.id)?.bucket ?? bucket)
    }

    return buckets.map((bucket) => cache.get(bucket.id)?.bucket ?? bucket)
  }

  private getOptimizationCache(cacheKey: string): Map<string, OptimizedBucketCacheEntry> {
    const cache = this.optimizedBucketCache.get(cacheKey)
    if (cache) {
      return cache
    }

    const nextCache = new Map<string, OptimizedBucketCacheEntry>()
    this.optimizedBucketCache.set(cacheKey, nextCache)
    return nextCache
  }

  private buildOptimizationCacheKey(
    request: MemoryTimelineQuery,
    config: MemoryDiaryConfig,
    contentTypes: MemoryDiaryContentType[]
  ): string {
    return JSON.stringify({
      date: request.date,
      timezone: request.timezone,
      bucketMinutes: config.timelineBucketMinutes,
      contentTypes,
      sensitiveAppPatterns: config.sensitiveAppPatterns,
      sensitiveWindowPatterns: config.sensitiveWindowPatterns
    })
  }

  private buildBucketFingerprint(bucket: MemoryDiaryTimelineBucket): string {
    const itemFingerprints = bucket.items.map((item) => [
      item.id,
      item.timestamp,
      item.contentType,
      item.appName,
      item.windowName,
      item.url,
      item.text
    ].join('\u001f')).join('\u001e')
    return [
      bucket.id,
      bucket.start,
      bucket.end,
      bucket.items.length,
      itemFingerprints
    ].join('\u001d')
  }

  private getLocalDateRange(date: string, timezone: string): { start: string, end: string } {
    const start = this.zonedLocalTimeToUtc(`${date}T00:00:00.000`, timezone)
    const end = this.zonedLocalTimeToUtc(`${date}T23:59:59.999`, timezone)
    return {
      start: start.toISOString(),
      end: end.toISOString()
    }
  }

  private zonedLocalTimeToUtc(localTimestamp: string, timezone: string): Date {
    const match = localTimestamp.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/
    )
    if (!match) {
      return new Date(localTimestamp)
    }

    const [, year, month, day, hour, minute, second, millisecond] = match
    const utcGuess = new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(millisecond)
    ))

    try {
      const offset = this.getTimezoneOffsetMs(utcGuess, timezone)
      const firstPass = new Date(utcGuess.getTime() - offset)
      const correctedOffset = this.getTimezoneOffsetMs(firstPass, timezone)
      return new Date(utcGuess.getTime() - correctedOffset)
    } catch {
      return new Date(localTimestamp)
    }
  }

  private getTimezoneOffsetMs(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    const parts = formatter.formatToParts(date)
    const values = new Map(parts.map((part) => [part.type, part.value]))
    const asUtc = Date.UTC(
      Number(values.get('year')),
      Number(values.get('month')) - 1,
      Number(values.get('day')),
      Number(values.get('hour')) % 24,
      Number(values.get('minute')),
      Number(values.get('second'))
    )
    return asUtc - date.getTime()
  }

  private createBuckets(
    items: MemoryDiaryItem[],
    bucketMinutes: number
  ): MemoryDiaryTimelineBucket[] {
    const groups = new Map<string, MemoryDiaryItem[]>()
    for (const item of items) {
      const key = createMemoryDiaryBucketStart(item.timestamp, bucketMinutes)
      groups.set(key, [...(groups.get(key) || []), item])
    }

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([start, bucketItems]) => {
        const startDate = new Date(start)
        const end = new Date(startDate.getTime() + bucketMinutes * 60 * 1000).toISOString()
        const appNames = this.unique(bucketItems.map((item) => item.appName).filter(Boolean))
        const windowNames = this.unique(bucketItems.map((item) => item.windowName).filter(Boolean))
        const urls = this.unique(bucketItems.map((item) => item.url).filter(Boolean))
        const contentTypes = this.unique(bucketItems.map((item) => item.contentType))
        const insight = buildMemoryDiaryTimelineInsight(bucketItems)
        const event = buildMemoryDiaryWorkEvent(bucketItems, insight)
        const readableItems = [...bucketItems].sort((left, right) => (
          TIMELINE_TEXT_SOURCE_PRIORITY[left.contentType] - TIMELINE_TEXT_SOURCE_PRIORITY[right.contentType]
        ))
        const keyTexts = insight.evidenceTexts.length > 0
          ? insight.evidenceTexts
            .map((text) => this.compactTimelineText(text, TIMELINE_KEY_TEXT_MAX_LENGTH))
            .slice(0, 5)
          : this.unique(readableItems
            .map((item) => this.compactTimelineText(item.text, TIMELINE_KEY_TEXT_MAX_LENGTH))
            .filter(Boolean)).slice(0, 5)

        return {
          id: start,
          start,
          end,
          title: event.title || this.buildBucketTitle(insight, appNames),
          summary: event.summary || (keyTexts[0]
            ? this.compactTimelineText(keyTexts[0], TIMELINE_SUMMARY_MAX_LENGTH)
            : '此时间段有活动记录'),
          appNames,
          windowNames,
          urls,
          contentTypes: contentTypes as MemoryDiaryContentType[],
          keyTexts,
          items: bucketItems,
          insight,
          event
        }
      })
  }

  private unique<T>(items: T[]): T[] {
    return Array.from(new Set(items))
  }

  private buildBucketTitle(
    insight: ReturnType<typeof buildMemoryDiaryTimelineInsight>,
    appNames: string[]
  ): string {
    const primaryApp = insight.dominantAppName !== '未知应用'
      ? insight.dominantAppName
      : appNames[0] || '未命名活动'
    const project = insight.projectHints.find((hint) => !/\.[a-z0-9]{1,6}\b/i.test(hint))
    if (project && project !== primaryApp) {
      return `${insight.activityLabel} · ${project}`
    }
    return `${insight.activityLabel} · ${primaryApp}`
  }

  private compactTimelineText(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLength) {
      return normalized
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
  }
}

export const memoryTimelineService = new MemoryTimelineService()
