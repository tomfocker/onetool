import type { ScreenOverlayLineResult } from '../../../shared/llm'
import type { OcrLine } from '../OcrService'
import { sanitizeText, type StructuredCompletionPrompts } from './shared'

export class ScreenshotInsightAdapter {
  buildTranslationCompletion(ocrLines: OcrLine[]): StructuredCompletionPrompts {
    return {
      systemPrompt: [
        '你是一个专业的屏幕翻译专家。',
        '输入是带 [index] 标号的 OCR 行文本。',
        '如果原文是中文则翻成英文，否则翻成中文。',
        '保持与输入相同的行数和顺序。',
        '只返回 JSON：{"lines":[{"index":0,"translatedText":"..." }]}。'
      ].join('\n'),
      userPrompt: ocrLines.map((line) => `[${line.index}] ${line.text}`).join('\n')
    }
  }

  mapTranslationResults(
    ocrLines: OcrLine[],
    payload: { lines?: Array<{ index?: number; translatedText?: string }> }
  ): ScreenOverlayLineResult[] {
    const translatedLines = Array.isArray(payload.lines) ? payload.lines : []
    return ocrLines.map((line) => {
      const matched = translatedLines.find((item) => item?.index === line.index)
      return {
        ...line,
        translatedText: sanitizeText(matched?.translatedText, '翻译失败')
      }
    })
  }
}
