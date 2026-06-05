export type TargetWeightUnit = 'KB' | 'MB'

export interface TargetQualityOptions {
  initialQuality: number
  targetBytes: number
  minQuality?: number
  attempts?: number
}

export interface TargetQualityResult {
  blob: Blob
  quality: number
  reachedTarget: boolean
  attempts: number
}

const ICO_MAX_SIZE = 256
const ICO_HEADER_SIZE = 6
const ICO_ENTRY_SIZE = 16
const ICO_IMAGE_OFFSET = ICO_HEADER_SIZE + ICO_ENTRY_SIZE

export function getTargetWeightBytes(value: number, unit: TargetWeightUnit): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1
  }

  const multiplier = unit === 'MB' ? 1024 * 1024 : 1024
  return Math.max(1, Math.round(value * multiplier))
}

export function isQualityAdjustableFormat(format: string): boolean {
  return format === 'image/jpeg' || format === 'image/webp'
}

export async function encodeWithTargetQuality(
  encode: (quality: number) => Promise<Blob | null>,
  options: TargetQualityOptions
): Promise<TargetQualityResult> {
  const targetBytes = Math.max(1, Math.round(options.targetBytes))
  const minQuality = clampQuality(options.minQuality ?? 0.1)
  const initialQuality = Math.max(minQuality, clampQuality(options.initialQuality))
  const maxAttempts = Math.max(1, Math.floor(options.attempts ?? 8))

  let low = minQuality
  let high = initialQuality
  let bestUnderTarget: TargetQualityResult | null = null
  let smallest: TargetQualityResult | null = null

  for (let index = 0; index < maxAttempts; index++) {
    const quality = index === 0 ? initialQuality : roundQuality((low + high) / 2)
    const blob = await encode(quality)

    if (!blob) {
      throw new Error('无法生成图片文件')
    }

    const attempt: TargetQualityResult = {
      blob,
      quality,
      reachedTarget: blob.size <= targetBytes,
      attempts: index + 1
    }

    if (!smallest || blob.size < smallest.blob.size) {
      smallest = attempt
    }

    if (attempt.reachedTarget) {
      bestUnderTarget = attempt
      low = quality
    } else {
      high = quality
    }
  }

  return bestUnderTarget ?? {
    ...smallest!,
    reachedTarget: false
  }
}

export function resolveIcoCanvasSize(width: number, height: number): { width: number; height: number } {
  const safeWidth = sanitizeDimension(width)
  const safeHeight = sanitizeDimension(height)

  if (safeWidth <= ICO_MAX_SIZE && safeHeight <= ICO_MAX_SIZE) {
    return { width: safeWidth, height: safeHeight }
  }

  const ratio = Math.min(ICO_MAX_SIZE / safeWidth, ICO_MAX_SIZE / safeHeight)
  return {
    width: sanitizeDimension(safeWidth * ratio),
    height: sanitizeDimension(safeHeight * ratio)
  }
}

export async function createIcoBlobFromPngBlob(pngBlob: Blob, width: number, height: number): Promise<Blob> {
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer())
  const icoBytes = new Uint8Array(ICO_IMAGE_OFFSET + pngBytes.length)
  const view = new DataView(icoBytes.buffer)
  const iconWidth = sanitizeIcoDirectorySize(width)
  const iconHeight = sanitizeIcoDirectorySize(height)

  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, 1, true)
  icoBytes[6] = iconWidth
  icoBytes[7] = iconHeight
  icoBytes[8] = 0
  icoBytes[9] = 0
  view.setUint16(10, 1, true)
  view.setUint16(12, 32, true)
  view.setUint32(14, pngBytes.length, true)
  view.setUint32(18, ICO_IMAGE_OFFSET, true)
  icoBytes.set(pngBytes, ICO_IMAGE_OFFSET)

  return new Blob([icoBytes], { type: 'image/vnd.microsoft.icon' })
}

function clampQuality(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.8
  }

  return Math.min(1, Math.max(0.01, value))
}

function roundQuality(value: number): number {
  return Math.round(value * 1000) / 1000
}

function sanitizeDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.max(1, Math.round(value))
}

function sanitizeIcoDirectorySize(value: number): number {
  const size = sanitizeDimension(value)
  return size >= ICO_MAX_SIZE ? 0 : size
}
