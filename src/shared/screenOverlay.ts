import type { ScreenOverlayLineResult } from './llm'

export const DEFAULT_MAX_OCR_IMAGE_DIMENSION = 1600

type OcrCanvasMetricsInput = {
  selectionWidth: number
  selectionHeight: number
  naturalScaleX: number
  naturalScaleY: number
  maxDimension?: number
}

export function getOcrCanvasMetrics(input: OcrCanvasMetricsInput) {
  const originalWidth = Math.max(1, Math.round(input.selectionWidth * input.naturalScaleX))
  const originalHeight = Math.max(1, Math.round(input.selectionHeight * input.naturalScaleY))
  const maxDimension = input.maxDimension ?? DEFAULT_MAX_OCR_IMAGE_DIMENSION
  const resizeRatio = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight))
  const canvasWidth = Math.max(1, Math.round(originalWidth * resizeRatio))
  const canvasHeight = Math.max(1, Math.round(originalHeight * resizeRatio))

  return {
    canvasWidth,
    canvasHeight,
    resultScaleX: canvasWidth / Math.max(input.selectionWidth, 1),
    resultScaleY: canvasHeight / Math.max(input.selectionHeight, 1)
  }
}

export function buildOcrExtractedText(lines: ScreenOverlayLineResult[]): string {
  return lines
    .map((line) => normalizeOcrTextLine(line.text))
    .filter(Boolean)
    .join('\n')
}

export function normalizeOcrTextLine(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/gu, '$1')
    .replace(/([\u3400-\u9fff])\s+(?=[，。！？；：、）】》〉])/gu, '$1')
    .replace(/([（【《〈])\s+(?=[\u3400-\u9fff])/gu, '$1')
    .trim()
}
