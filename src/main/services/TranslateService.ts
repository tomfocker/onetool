import type { IpcResponse } from '../../shared/types'
import type { ScreenOverlayLineResult, ScreenOverlayMode } from '../../shared/llm'
import { llmService } from './LlmService'

export class TranslateService {
  constructor() { }

  async translateImage(base64Image: string, mode: ScreenOverlayMode = 'translate'): Promise<IpcResponse<ScreenOverlayLineResult[]>> {
    return llmService.translateImage(base64Image, mode)
  }
}

export const translateService = new TranslateService()
