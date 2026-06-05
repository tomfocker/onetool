export type ImageDimensionMethod = 'original' | 'limit' | 'custom'
export type CustomResizeMode = 'fit' | 'crop' | 'stretch'

export interface ImageSourceDimensions {
  width: number
  height: number
}

export interface ImageProcessingDimensionOptions {
  method: ImageDimensionMethod
  limitPixels: number
  customWidth: number
  customHeight: number
  customResizeMode: CustomResizeMode
}

export interface ImageOutputLayout {
  canvasWidth: number
  canvasHeight: number
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  drawX: number
  drawY: number
  drawWidth: number
  drawHeight: number
}

const MIN_CANVAS_PIXELS = 1
const MAX_CANVAS_PIXELS = 30000

export function sanitizePixelInput(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10)

  if (!Number.isFinite(parsed)) {
    return MIN_CANVAS_PIXELS
  }

  return Math.min(MAX_CANVAS_PIXELS, Math.max(MIN_CANVAS_PIXELS, Math.round(parsed)))
}

export function resolveImageOutputLayout(
  source: ImageSourceDimensions,
  options: ImageProcessingDimensionOptions
): ImageOutputLayout {
  const sourceWidth = sanitizePixelInput(source.width)
  const sourceHeight = sanitizePixelInput(source.height)

  if (options.method === 'limit') {
    const limitPixels = sanitizePixelInput(options.limitPixels)

    if (sourceWidth <= limitPixels && sourceHeight <= limitPixels) {
      return createFullCanvasLayout(sourceWidth, sourceHeight, sourceWidth, sourceHeight)
    }

    const ratio = Math.min(limitPixels / sourceWidth, limitPixels / sourceHeight)
    const canvasWidth = sanitizePixelInput(sourceWidth * ratio)
    const canvasHeight = sanitizePixelInput(sourceHeight * ratio)

    return createFullCanvasLayout(canvasWidth, canvasHeight, sourceWidth, sourceHeight)
  }

  if (options.method === 'custom') {
    const canvasWidth = sanitizePixelInput(options.customWidth)
    const canvasHeight = sanitizePixelInput(options.customHeight)

    if (options.customResizeMode === 'stretch') {
      return createFullCanvasLayout(canvasWidth, canvasHeight, sourceWidth, sourceHeight)
    }

    if (options.customResizeMode === 'crop') {
      const targetRatio = canvasWidth / canvasHeight
      const sourceRatio = sourceWidth / sourceHeight
      let sourceX = 0
      let sourceY = 0
      let croppedSourceWidth = sourceWidth
      let croppedSourceHeight = sourceHeight

      if (sourceRatio > targetRatio) {
        croppedSourceWidth = sanitizePixelInput(sourceHeight * targetRatio)
        sourceX = Math.round((sourceWidth - croppedSourceWidth) / 2)
      } else if (sourceRatio < targetRatio) {
        croppedSourceHeight = sanitizePixelInput(sourceWidth / targetRatio)
        sourceY = Math.round((sourceHeight - croppedSourceHeight) / 2)
      }

      return {
        canvasWidth,
        canvasHeight,
        sourceX,
        sourceY,
        sourceWidth: croppedSourceWidth,
        sourceHeight: croppedSourceHeight,
        drawX: 0,
        drawY: 0,
        drawWidth: canvasWidth,
        drawHeight: canvasHeight
      }
    }

    const ratio = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    const drawWidth = sanitizePixelInput(sourceWidth * ratio)
    const drawHeight = sanitizePixelInput(sourceHeight * ratio)

    return {
      canvasWidth,
      canvasHeight,
      sourceX: 0,
      sourceY: 0,
      sourceWidth,
      sourceHeight,
      drawX: Math.round((canvasWidth - drawWidth) / 2),
      drawY: Math.round((canvasHeight - drawHeight) / 2),
      drawWidth,
      drawHeight
    }
  }

  return createFullCanvasLayout(sourceWidth, sourceHeight, sourceWidth, sourceHeight)
}

function createFullCanvasLayout(
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number
): ImageOutputLayout {
  return {
    canvasWidth: width,
    canvasHeight: height,
    sourceX: 0,
    sourceY: 0,
    sourceWidth,
    sourceHeight,
    drawX: 0,
    drawY: 0,
    drawWidth: width,
    drawHeight: height
  }
}
