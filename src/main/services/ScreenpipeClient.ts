import type { IpcResponse } from '../../shared/types'
import type { MemoryDiaryContentType, MemoryDiaryItem } from '../../shared/memoryDiary'

type FetchLike = typeof fetch

export interface ScreenpipeConnectionConfig {
  apiUrl: string
  apiKey: string
}

export interface ScreenpipeSearchRequest extends ScreenpipeConnectionConfig {
  startTime: string
  endTime: string
  contentTypes: MemoryDiaryContentType[]
  limit?: number
}

type ScreenpipePayloadItem = {
  type?: string
  content?: Record<string, unknown>
}
const SCREENPIPE_SEARCH_MAX_PAGES = 50

export class ScreenpipeClient {
  private readonly fetchImpl: FetchLike

  constructor(dependencies: { fetch?: FetchLike } = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch
  }

  async health(config: ScreenpipeConnectionConfig): Promise<IpcResponse<{ status: string }>> {
    try {
      const response = await this.fetchImpl(this.buildUrl(config.apiUrl, '/health'), {
        headers: this.buildHeaders(config.apiKey)
      })
      if (!response.ok) {
        return {
          success: false,
          error: await this.readError(response, 'ScreenPipe 健康检查失败')
        }
      }

      const payload = await response.json() as { status?: string }
      return { success: true, data: { status: payload.status || 'ok' } }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async search(request: ScreenpipeSearchRequest): Promise<IpcResponse<MemoryDiaryItem[]>> {
    try {
      if (request.contentTypes.length === 0) {
        return { success: true, data: [] }
      }

      const results = await Promise.all(
        request.contentTypes.map((contentType) => this.searchContentType(request, contentType))
      )
      const failedResult = results.find((result) => !result.success)
      if (failedResult) {
        return failedResult
      }

      const items = results
        .flatMap((result) => result.data || [])
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp))

      return { success: true, data: items }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  private buildUrl(apiUrl: string, apiPath: string): string {
    return `${apiUrl.replace(/\/$/, '')}${apiPath}`
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`
    }
    return headers
  }

  private async searchContentType(
    request: ScreenpipeSearchRequest,
    contentType: MemoryDiaryContentType
  ): Promise<IpcResponse<MemoryDiaryItem[]>> {
    const pageSize = Math.max(1, request.limit ?? 1000)
    const items: MemoryDiaryItem[] = []
    const seenPageSignatures = new Set<string>()

    for (let page = 0; page < SCREENPIPE_SEARCH_MAX_PAGES; page += 1) {
      const offset = page * pageSize
      const pageResult = await this.searchContentTypePage(request, contentType, pageSize, offset)
      if (!pageResult.success) {
        return pageResult
      }

      const pageItems = pageResult.data || []
      if (pageItems.length === 0) {
        break
      }

      const signature = pageItems.map((item) => item.id).join('|')
      if (seenPageSignatures.has(signature)) {
        break
      }

      seenPageSignatures.add(signature)
      items.push(...pageItems)

      if (pageItems.length < pageSize) {
        break
      }
    }

    return { success: true, data: items }
  }

  private async searchContentTypePage(
    request: ScreenpipeSearchRequest,
    contentType: MemoryDiaryContentType,
    limit: number,
    offset: number
  ): Promise<IpcResponse<MemoryDiaryItem[]>> {
    const params = new URLSearchParams()
    params.set('start_time', request.startTime)
    params.set('end_time', request.endTime)
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    params.set('content_type', contentType)

    const response = await this.fetchImpl(`${this.buildUrl(request.apiUrl, '/search')}?${params.toString()}`, {
      headers: this.buildHeaders(request.apiKey)
    })
    if (!response.ok) {
      return {
        success: false,
        error: await this.readError(response, `ScreenPipe ${contentType} 搜索失败`)
      }
    }

    const payload = await response.json() as { data?: ScreenpipePayloadItem[] }
    const items = (payload.data || [])
      .map((item, index) => this.mapItem(item, offset + index))
      .filter((item): item is MemoryDiaryItem => Boolean(item))

    return { success: true, data: items }
  }

  private async readError(response: Response, fallback: string): Promise<string> {
    try {
      const body = await response.text()
      return `${fallback} (${response.status})${body ? `: ${body.slice(0, 160)}` : ''}`
    } catch {
      return `${fallback} (${response.status})`
    }
  }

  private mapItem(item: ScreenpipePayloadItem, index: number): MemoryDiaryItem | null {
    const content = item.content || {}
    const contentType = this.mapContentType(item.type)
    const text = this.getFirstStringValue(content.text, content.transcription, content.text_content).trim()
    const timestamp = String(content.timestamp ?? content.created_at ?? '')
    if (!contentType || !text || !timestamp) {
      return null
    }

    const rawId = String(content.id ?? content.frame_id ?? content.chunk_id ?? index)
    return {
      id: `${contentType}-${rawId}`,
      timestamp,
      contentType,
      appName: String(content.app_name ?? content.appName ?? ''),
      windowName: String(content.window_name ?? content.windowName ?? content.window_title ?? ''),
      url: String(content.browser_url ?? content.url ?? ''),
      text
    }
  }

  private mapContentType(input: unknown): MemoryDiaryContentType | null {
    const normalized = String(input ?? '').toLowerCase()
    if (normalized === 'ui' || normalized.includes('accessibility')) return 'accessibility'
    if (normalized.includes('ocr')) return 'ocr'
    if (normalized.includes('audio')) return 'audio'
    if (normalized.includes('input')) return 'input'
    return null
  }

  private getFirstStringValue(...values: unknown[]): string {
    const value = values.find((item) => typeof item === 'string' && item.trim().length > 0)
    return typeof value === 'string' ? value : ''
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const screenpipeClient = new ScreenpipeClient()
