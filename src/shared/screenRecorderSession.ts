export type RecorderSessionStatus =
  | 'idle'
  | 'selecting-area'
  | 'ready-to-record'
  | 'recording'
  | 'finishing'

export type RecorderSessionMode = 'full' | 'area'

export interface RecorderBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RecorderSessionUpdate {
  status?: RecorderSessionStatus
  mode?: RecorderSessionMode
  outputPath?: string
  recordingTime?: string
  selectionBounds?: RecorderBounds
  selectionPreviewDataUrl?: string
  selectedDisplayId?: string | null
}

export interface RecorderSessionUpdateInput {
  status?: RecorderSessionStatus
  mode?: RecorderSessionMode
  outputPath?: string
  recordingTime?: string
  selectionBounds?: RecorderBounds
  selectionPreviewDataUrl?: string
  selectedDisplayId?: string | null
}

const MIN_RECORDER_SIZE = 64

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getOutputExtension(format: 'mp4' | 'gif'): string {
  if (format === 'gif') {
    return '.gif'
  }

  return '.mp4'
}

export function clampRecorderBounds(bounds: RecorderBounds, availableBounds: RecorderBounds): RecorderBounds {
  const width = clamp(bounds.width, MIN_RECORDER_SIZE, availableBounds.width)
  const height = clamp(bounds.height, MIN_RECORDER_SIZE, availableBounds.height)

  const maxX = availableBounds.x + availableBounds.width - width
  const maxY = availableBounds.y + availableBounds.height - height

  return {
    x: clamp(bounds.x, availableBounds.x, maxX),
    y: clamp(bounds.y, availableBounds.y, maxY),
    width,
    height
  }
}

export function nudgeRecorderBounds(
  bounds: RecorderBounds,
  field: 'x' | 'y' | 'width' | 'height',
  delta: number,
  display: RecorderBounds,
  minSize = MIN_RECORDER_SIZE
): RecorderBounds {
  const nextBounds = { ...bounds }

  if (field === 'x') {
    const maxX = display.x + display.width - nextBounds.width
    nextBounds.x = clamp(nextBounds.x + delta, display.x, maxX)
  } else if (field === 'y') {
    const maxY = display.y + display.height - nextBounds.height
    nextBounds.y = clamp(nextBounds.y + delta, display.y, maxY)
  } else if (field === 'width') {
    const maxWidth = display.x + display.width - nextBounds.x
    nextBounds.width = clamp(nextBounds.width + delta, minSize, maxWidth)
  } else {
    const maxHeight = display.y + display.height - nextBounds.y
    nextBounds.height = clamp(nextBounds.height + delta, minSize, maxHeight)
  }

  return nextBounds
}

export function isRecorderSelectionValid(bounds: RecorderBounds, minSize = MIN_RECORDER_SIZE): boolean {
  return bounds.width >= minSize && bounds.height >= minSize
}

export function ensureRecorderOutputPath(outputPath: string, format: 'mp4' | 'gif'): string {
  if (!outputPath) {
    return outputPath
  }

  const expectedExtension = getOutputExtension(format)
  const match = outputPath.match(/\.[^/\\]+$/)
  if (!match) {
    return `${outputPath}${expectedExtension}`
  }

  if (match[0].toLowerCase() === expectedExtension) {
    return outputPath
  }

  return outputPath.slice(0, -match[0].length) + expectedExtension
}

export function toRecorderSessionUpdate(update: RecorderSessionUpdateInput): RecorderSessionUpdate {
  const nextUpdate: RecorderSessionUpdate = {}

  if (typeof update.status !== 'undefined') {
    nextUpdate.status = update.status
  }

  if (typeof update.mode !== 'undefined') {
    nextUpdate.mode = update.mode
  }

  if (typeof update.outputPath !== 'undefined') {
    nextUpdate.outputPath = update.outputPath
  }

  if (typeof update.recordingTime !== 'undefined') {
    nextUpdate.recordingTime = update.recordingTime
  }

  if (typeof update.selectionBounds !== 'undefined') {
    nextUpdate.selectionBounds = { ...update.selectionBounds }
  }

  if (typeof update.selectionPreviewDataUrl !== 'undefined') {
    nextUpdate.selectionPreviewDataUrl = update.selectionPreviewDataUrl
  }

  if (typeof update.selectedDisplayId !== 'undefined') {
    nextUpdate.selectedDisplayId = update.selectedDisplayId
  }

  return nextUpdate
}
