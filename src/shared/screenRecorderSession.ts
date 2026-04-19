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
  status: RecorderSessionStatus
  mode: RecorderSessionMode
  outputPath: string
  recordingTime: string
  selectionBounds: RecorderBounds | null
  selectionPreviewDataUrl: string | null
  selectedDisplayId: string | null
}

export interface RecorderSessionUpdateInput {
  status: RecorderSessionStatus
  mode: RecorderSessionMode
  outputPath?: string
  recordingTime?: string
  selectionBounds?: RecorderBounds | null
  selectionPreviewDataUrl?: string | null
  selectedDisplayId?: string | null
}

export interface RecorderStartSessionInput {
  outputPath: string
  displayId?: string
  usePreparedSelection?: boolean
}

const MIN_RECORDER_SIZE = 64

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}

function normalizeRecorderBounds(
  bounds: RecorderBounds,
  display: RecorderBounds,
  minSize: number
): RecorderBounds {
  const width = clamp(bounds.width, minSize, display.width)
  const height = clamp(bounds.height, minSize, display.height)
  const x = clamp(bounds.x, display.x, display.x + display.width - width)
  const y = clamp(bounds.y, display.y, display.y + display.height - height)

  return { x, y, width, height }
}

function getOutputExtension(format: 'mp4' | 'gif'): string {
  if (format === 'gif') {
    return '.gif'
  }

  return '.mp4'
}

export function clampRecorderBounds(
  bounds: RecorderBounds,
  availableBounds: RecorderBounds,
  minSize = MIN_RECORDER_SIZE
): RecorderBounds {
  return normalizeRecorderBounds(bounds, availableBounds, minSize)
}

export function nudgeRecorderBounds(
  bounds: RecorderBounds,
  field: 'x' | 'y' | 'width' | 'height',
  delta: number,
  display: RecorderBounds,
  minSize = MIN_RECORDER_SIZE
): RecorderBounds {
  const normalizedBounds = normalizeRecorderBounds(bounds, display, minSize)
  const nextBounds = { ...normalizedBounds }

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

  return normalizeRecorderBounds(nextBounds, display, minSize)
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
  return {
    status: update.status,
    mode: update.mode,
    outputPath: update.outputPath ?? '',
    recordingTime: update.recordingTime ?? '00:00:00',
    selectionBounds: update.selectionBounds ? { ...update.selectionBounds } : null,
    selectionPreviewDataUrl: update.selectionPreviewDataUrl ?? null,
    selectedDisplayId: update.selectedDisplayId ?? null
  }
}

export function createRecorderSessionUpdate(
  current: RecorderSessionUpdate,
  patch: Partial<Omit<RecorderSessionUpdate, 'selectionBounds'>> & {
    selectionBounds?: RecorderBounds | null
  }
): RecorderSessionUpdate {
  return toRecorderSessionUpdate({
    status: patch.status ?? current.status,
    mode: patch.mode ?? current.mode,
    outputPath: patch.outputPath ?? current.outputPath,
    recordingTime: patch.recordingTime ?? current.recordingTime,
    selectionBounds: typeof patch.selectionBounds === 'undefined' ? current.selectionBounds : patch.selectionBounds,
    selectionPreviewDataUrl:
      typeof patch.selectionPreviewDataUrl === 'undefined'
        ? current.selectionPreviewDataUrl
        : patch.selectionPreviewDataUrl,
    selectedDisplayId:
      typeof patch.selectedDisplayId === 'undefined'
        ? current.selectedDisplayId
        : patch.selectedDisplayId
  })
}

export function resolveRecorderStartSession(
  current: RecorderSessionUpdate,
  input: RecorderStartSessionInput
): RecorderSessionUpdate {
  if (input.usePreparedSelection && current.selectionBounds) {
    return toRecorderSessionUpdate({
      status: 'recording',
      mode: 'area',
      outputPath: input.outputPath,
      recordingTime: '00:00:00',
      selectionBounds: current.selectionBounds,
      selectionPreviewDataUrl: current.selectionPreviewDataUrl,
      selectedDisplayId: current.selectedDisplayId
    })
  }

  return toRecorderSessionUpdate({
    status: 'recording',
    mode: 'full',
    outputPath: input.outputPath,
    recordingTime: '00:00:00',
    selectionBounds: null,
    selectionPreviewDataUrl: null,
    selectedDisplayId: input.displayId ?? null
  })
}

export function beginRecorderSelectionSession(
  current: RecorderSessionUpdate
): RecorderSessionUpdate | null {
  if (current.status === 'recording' || current.status === 'finishing') {
    return null
  }

  return toRecorderSessionUpdate({
    status: 'selecting-area',
    mode: 'area',
    outputPath: current.outputPath,
    recordingTime: '00:00:00',
    selectionBounds: null,
    selectionPreviewDataUrl: null,
    selectedDisplayId: null
  })
}

export function cancelRecorderSelectionSession(
  current: RecorderSessionUpdate
): RecorderSessionUpdate {
  return toRecorderSessionUpdate({
    status: 'idle',
    mode: 'full',
    outputPath: current.outputPath,
    recordingTime: '00:00:00',
    selectionBounds: null,
    selectionPreviewDataUrl: null,
    selectedDisplayId: null
  })
}
