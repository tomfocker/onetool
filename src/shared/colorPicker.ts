export interface ColorPickerBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ColorPickerDisplayDescriptor {
  id: number
  bounds: ColorPickerBounds
  scaleFactor: number
}

export interface ColorPickerCaptureSource {
  display_id: string
  width: number
  height: number
  dataUrl: string
}

export interface PickedColor {
  hex: string
  rgb: string
  r: number
  g: number
  b: number
  x: number
  y: number
}

export function buildCaptureThumbnailSize(displays: ColorPickerDisplayDescriptor[]): { width: number; height: number } {
  return displays.reduce(
    (size, display) => ({
      width: Math.max(size.width, Math.round(display.bounds.width * display.scaleFactor)),
      height: Math.max(size.height, Math.round(display.bounds.height * display.scaleFactor))
    }),
    { width: 0, height: 0 }
  )
}

function scoreCaptureMatch(display: ColorPickerDisplayDescriptor, source: ColorPickerCaptureSource): number {
  const targetRatio = display.bounds.width / display.bounds.height
  const sourceRatio = source.width / source.height
  const ratioDiff = Math.abs(targetRatio - sourceRatio)

  if (ratioDiff > 0.02) {
    return Number.POSITIVE_INFINITY
  }

  const expectedWidth = Math.round(display.bounds.width * display.scaleFactor)
  const expectedHeight = Math.round(display.bounds.height * display.scaleFactor)

  return Math.abs(source.width - expectedWidth) + Math.abs(source.height - expectedHeight)
}

export function mapCaptureSourcesToDisplays(
  displays: ColorPickerDisplayDescriptor[],
  sources: ColorPickerCaptureSource[]
): {
  screenshots: Map<number, string>
  missingDisplayIds: number[]
} {
  const screenshots = new Map<number, string>()
  const missingDisplayIds: number[] = []
  const usedSources = new Set<number>()

  displays.forEach((display) => {
    const exactMatchIndex = sources.findIndex((source, index) => {
      return !usedSources.has(index) && source.display_id === display.id.toString()
    })

    if (exactMatchIndex >= 0) {
      screenshots.set(display.id, sources[exactMatchIndex].dataUrl)
      usedSources.add(exactMatchIndex)
      return
    }

    let bestIndex = -1
    let bestScore = Number.POSITIVE_INFINITY

    sources.forEach((source, index) => {
      if (usedSources.has(index)) {
        return
      }

      const score = scoreCaptureMatch(display, source)
      if (score < bestScore) {
        bestScore = score
        bestIndex = index
      }
    })

    if (bestIndex >= 0) {
      screenshots.set(display.id, sources[bestIndex].dataUrl)
      usedSources.add(bestIndex)
      return
    }

    missingDisplayIds.push(display.id)
  })

  return { screenshots, missingDisplayIds }
}

export function toAbsoluteScreenPosition(point: { x: number; y: number }, bounds: ColorPickerBounds): { x: number; y: number } {
  return {
    x: bounds.x + point.x,
    y: bounds.y + point.y
  }
}
