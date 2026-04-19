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
  bounds?: RecorderBounds
  outputPath?: string
}

const MIN_RECORDER_SIZE = 64

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getOutputExtension(format: string): string {
  if (format === 'gif') {
    return '.gif'
  }

  if (format === 'webm') {
    return '.webm'
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

export function nudgeRecorderBounds(bounds: RecorderBounds, delta: { x: number; y: number }): RecorderBounds {
  return {
    x: bounds.x + delta.x,
    y: bounds.y + delta.y,
    width: bounds.width,
    height: bounds.height
  }
}

export function isRecorderSelectionValid(bounds: RecorderBounds): boolean {
  return bounds.width >= MIN_RECORDER_SIZE && bounds.height >= MIN_RECORDER_SIZE
}

export function ensureRecorderOutputPath(outputPath: string, format: string = 'mp4'): string {
  if (!outputPath) {
    return outputPath
  }

  if (/\.[^/\\]+$/.test(outputPath)) {
    return outputPath
  }

  return `${outputPath}${getOutputExtension(format)}`
}

export function toRecorderSessionUpdate(update: RecorderSessionUpdate): RecorderSessionUpdate {
  const nextUpdate: RecorderSessionUpdate = {}

  if (update.status) {
    nextUpdate.status = update.status
  }

  if (update.mode) {
    nextUpdate.mode = update.mode
  }

  if (update.bounds) {
    nextUpdate.bounds = { ...update.bounds }
  }

  if (update.outputPath) {
    nextUpdate.outputPath = ensureRecorderOutputPath(update.outputPath)
  }

  return nextUpdate
}
