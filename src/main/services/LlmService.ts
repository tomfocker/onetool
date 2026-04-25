import type { IpcResponse } from '../../shared/types'
import type {
  LlmConfigField,
  LlmConfigStatus,
  LlmConnectionStatus,
  LlmInsight,
  LlmCalendarAssistantRequest,
  LlmCalendarAssistantResult,
  LlmRenameInputFile,
  LlmRenameSuggestion,
  ScreenOverlayLineResult,
  ScreenOverlayMode,
  LlmSpaceCleanupSuggestionRequest,
  LlmSystemAnalysisRequest
} from '../../shared/llm'
import { settingsService } from './SettingsService'
import { ocrService, type OcrLine } from './OcrService'
import { ScreenshotInsightAdapter } from './llmAdapters/ScreenshotInsightAdapter'
import { RenameSuggestionAdapter } from './llmAdapters/RenameSuggestionAdapter'
import { SpaceCleanupAdapter } from './llmAdapters/SpaceCleanupAdapter'
import { SystemDiagnosisAdapter } from './llmAdapters/SystemDiagnosisAdapter'
import { CalendarAssistantAdapter } from './llmAdapters/CalendarAssistantAdapter'
import { OpenAiCompatibleClient } from './OpenAiCompatibleClient'

type SettingsLike = Pick<typeof settingsService, 'getSettings'>
type OcrLike = Pick<typeof ocrService, 'recognize'>

type StructuredCompletionInput = {
  systemPrompt: string
  userPrompt: string
}

type SharedLlmSettings = {
  apiUrl: string
  apiKey: string
  model: string
}

type LlmServiceDependencies = {
  fetch?: typeof fetch
  settingsService?: SettingsLike
  ocrService?: OcrLike
}

export class LlmService {
  private readonly settings: SettingsLike
  private readonly ocr: OcrLike
  private readonly client: OpenAiCompatibleClient
  private readonly screenshotInsightAdapter: ScreenshotInsightAdapter
  private readonly renameSuggestionAdapter: RenameSuggestionAdapter
  private readonly systemDiagnosisAdapter: SystemDiagnosisAdapter
  private readonly spaceCleanupAdapter: SpaceCleanupAdapter
  private readonly calendarAssistantAdapter: CalendarAssistantAdapter

  constructor(dependencies: LlmServiceDependencies = {}) {
    this.settings = dependencies.settingsService ?? settingsService
    this.ocr = dependencies.ocrService ?? ocrService
    this.client = new OpenAiCompatibleClient({ fetch: dependencies.fetch })
    this.screenshotInsightAdapter = new ScreenshotInsightAdapter()
    this.renameSuggestionAdapter = new RenameSuggestionAdapter()
    this.systemDiagnosisAdapter = new SystemDiagnosisAdapter()
    this.spaceCleanupAdapter = new SpaceCleanupAdapter()
    this.calendarAssistantAdapter = new CalendarAssistantAdapter()
  }

  getConfigStatus(): IpcResponse<LlmConfigStatus> {
    const config = this.getSharedConfig()
    const missing = this.getMissingConfigFields(config)

    return {
      success: true,
      data: {
        configured: missing.length === 0,
        baseUrl: config.apiUrl,
        model: config.model,
        missing
      }
    }
  }

  async testConnection(): Promise<IpcResponse<LlmConnectionStatus>> {
    const config = this.getSharedConfig()
    const missing = this.getMissingConfigFields(config)
    if (missing.length > 0) {
      return { success: false, error: `LLM 配置不完整：${missing.join(', ')}` }
    }

    try {
      await this.createStructuredCompletion<{ ok?: boolean }>({
        systemPrompt: '你是接口连通性检查器。只返回 JSON：{"ok": true}',
        userPrompt: '请返回 {"ok": true}。'
      })

      return {
        success: true,
        data: {
          provider: new URL(config.apiUrl).host,
          model: config.model
        }
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async translateImage(base64Image: string, mode: ScreenOverlayMode = 'translate'): Promise<IpcResponse<ScreenOverlayLineResult[]>> {
    try {
      const ocrResult = await this.ocr.recognize(base64Image)
      if (!ocrResult.success || !ocrResult.data || ocrResult.data.length === 0) {
        return { success: false, error: ocrResult.error || '未识别到有效文字' }
      }

      const ocrLines = ocrResult.data
      if (mode === 'ocr') {
        return {
          success: true,
          data: ocrLines.map((line) => ({
            ...line,
            translatedText: null
          }))
        }
      }

      const prompts = this.screenshotInsightAdapter.buildTranslationCompletion(ocrLines)
      const payload = await this.createStructuredCompletion<{ lines?: Array<{ index?: number; translatedText?: string }> }>(prompts)
      return {
        success: true,
        data: this.screenshotInsightAdapter.mapTranslationResults(ocrLines, payload)
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async analyzeSystem(input: LlmSystemAnalysisRequest): Promise<IpcResponse<LlmInsight>> {
    try {
      const payload = await this.createStructuredCompletion<Partial<LlmInsight>>(
        this.systemDiagnosisAdapter.buildCompletion(input)
      )
      return { success: true, data: this.systemDiagnosisAdapter.mapInsightResult(payload) }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async suggestRename(input: {
    instructions: string
    files: LlmRenameInputFile[]
  }): Promise<IpcResponse<LlmRenameSuggestion>> {
    if (!input.instructions.trim()) {
      return { success: false, error: '请先输入重命名目标' }
    }

    if (input.files.length === 0) {
      return { success: false, error: '请先添加待重命名文件' }
    }

    try {
      const payload = await this.createStructuredCompletion<{
        summary?: string
        namingPattern?: string
        warnings?: unknown
        suggestions?: Array<{ index?: number; newName?: string; reason?: string | null }>
      }>(this.renameSuggestionAdapter.buildCompletion(input))

      return {
        success: true,
        data: this.renameSuggestionAdapter.mapSuggestionResult(input, payload)
      }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async suggestSpaceCleanup(input: LlmSpaceCleanupSuggestionRequest): Promise<IpcResponse<LlmInsight>> {
    try {
      const payload = await this.createStructuredCompletion<Partial<LlmInsight>>(
        this.spaceCleanupAdapter.buildCompletion(input)
      )
      return { success: true, data: this.spaceCleanupAdapter.mapInsightResult(payload) }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async parseCalendarAssistant(input: LlmCalendarAssistantRequest): Promise<IpcResponse<LlmCalendarAssistantResult>> {
    if (!input.message.trim()) {
      return {
        success: true,
        data: {
          type: 'help',
          message: '你可以直接说：明天下午3点安排设计评审，地点会议室A。'
        }
      }
    }

    try {
      const payload = await this.createStructuredCompletion<{
        action?: unknown
        message?: unknown
        search?: unknown
        event?: Record<string, unknown>
      }>(this.calendarAssistantAdapter.buildCompletion(input))
      return { success: true, data: this.calendarAssistantAdapter.mapAssistantResult(input, payload) }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  private getSharedConfig(): SharedLlmSettings {
    const settings = this.settings.getSettings()
    return {
      apiUrl: settings.translateApiUrl?.trim() || '',
      apiKey: settings.translateApiKey?.trim() || '',
      model: settings.translateModel?.trim() || ''
    }
  }

  private getMissingConfigFields(config: SharedLlmSettings): LlmConfigField[] {
    const missing: LlmConfigField[] = []
    if (!config.apiUrl) missing.push('baseUrl')
    if (!config.apiKey) missing.push('apiKey')
    if (!config.model) missing.push('model')
    return missing
  }

  private async createStructuredCompletion<T>({ systemPrompt, userPrompt }: StructuredCompletionInput): Promise<T> {
    const config = this.getSharedConfig()
    const missing = this.getMissingConfigFields(config)
    if (missing.length > 0) {
      throw new Error(`LLM 配置不完整：${missing.join(', ')}`)
    }

    return this.client.createJsonCompletion<T>({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      model: config.model,
      systemPrompt,
      userPrompt
    })
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const llmService = new LlmService()
