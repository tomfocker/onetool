export type PdfToolMode =
  | 'images-to-pdf'
  | 'pdf-to-images'
  | 'merge-pdfs'
  | 'split-pdf'
  | 'extract-pages'
  | 'delete-pages'
  | 'rotate-pages'
export type PdfToolInputKind = 'pdf' | 'image' | 'unknown'
export type PdfToolOutputKind = 'pdf' | 'image'
export type PdfToolImageFormat = 'png'
export type PdfToolRotationDegrees = 90 | 180 | 270

export interface PdfToolChooseFilesResult {
  canceled: boolean
  paths: string[]
}

export interface PdfToolChooseDirectoryResult {
  canceled: boolean
  path: string | null
}

export interface PdfToolConvertRequest {
  mode: PdfToolMode
  inputPaths: string[]
  outputDirectory?: string
  outputName?: string
  imageScale?: number
  imageFormat?: PdfToolImageFormat
  pageSelection?: string
  rotationDegrees?: PdfToolRotationDegrees
}

export interface PdfToolOutputFile {
  path: string
  name: string
  kind: PdfToolOutputKind
  sizeBytes: number | null
}

export interface PdfToolConvertResult {
  mode: PdfToolMode
  outputDirectory: string
  outputFiles: PdfToolOutputFile[]
  message: string
}

export const PDF_TOOL_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const
export const PDF_TOOL_PDF_EXTENSIONS = ['pdf'] as const

const PDF_TOOL_MODE_LABELS: Record<PdfToolMode, string> = {
  'images-to-pdf': '图片转 PDF',
  'pdf-to-images': 'PDF 转图片',
  'merge-pdfs': '合并 PDF',
  'split-pdf': '拆分 PDF',
  'extract-pages': '提取页面',
  'delete-pages': '删除页面',
  'rotate-pages': '旋转页面'
}

function getPathExtension(inputPath: string): string {
  const name = getPathBaseName(inputPath)
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

function getPathBaseName(inputPath: string): string {
  return inputPath.split(/[\\/]/).pop() || inputPath
}

function getPathBaseNameWithoutExtension(inputPath: string): string {
  const name = getPathBaseName(inputPath)
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(0, index) : name
}

export function getPdfToolModeLabel(mode: PdfToolMode): string {
  return PDF_TOOL_MODE_LABELS[mode]
}

export function getPdfToolAcceptedExtensions(mode: PdfToolMode): string[] {
  if (mode === 'images-to-pdf') {
    return [...PDF_TOOL_IMAGE_EXTENSIONS]
  }
  return [...PDF_TOOL_PDF_EXTENSIONS]
}

export function getPdfToolInputKind(inputPath: string): PdfToolInputKind {
  const extension = getPathExtension(inputPath)
  if (PDF_TOOL_PDF_EXTENSIONS.includes(extension as (typeof PDF_TOOL_PDF_EXTENSIONS)[number])) {
    return 'pdf'
  }
  if (
    PDF_TOOL_IMAGE_EXTENSIONS.includes(extension as (typeof PDF_TOOL_IMAGE_EXTENSIONS)[number])
  ) {
    return 'image'
  }
  return 'unknown'
}

export function filterPdfToolInputPaths(mode: PdfToolMode, inputPaths: string[]): string[] {
  const expectedKind: PdfToolInputKind = mode === 'images-to-pdf' ? 'image' : 'pdf'
  return inputPaths.filter((inputPath) => getPdfToolInputKind(inputPath) === expectedKind)
}

export function getPdfToolDefaultOutputName(mode: PdfToolMode, inputPaths: string[]): string {
  if (mode === 'merge-pdfs') {
    return 'merged-pdf'
  }

  const firstInput = inputPaths[0]
  if (!firstInput) {
    return mode === 'images-to-pdf' ? 'converted-images' : 'converted-pages'
  }

  const baseName = getPathBaseNameWithoutExtension(firstInput).trim()
  const safeBaseName = baseName || 'converted'
  if (mode === 'images-to-pdf') return `${safeBaseName}-images`
  if (mode === 'pdf-to-images') return `${safeBaseName}-pages`
  if (mode === 'split-pdf') return `${safeBaseName}-split`
  if (mode === 'extract-pages') return `${safeBaseName}-extracted`
  if (mode === 'delete-pages') return `${safeBaseName}-edited`
  return `${safeBaseName}-rotated`
}

export function normalizePdfToolImageScale(imageScale: number | undefined): number {
  if (!Number.isFinite(imageScale)) {
    return 2
  }
  return Math.min(4, Math.max(1, Math.round(imageScale as number)))
}

export function parsePdfToolPageSelection(
  pageSelection: string | undefined,
  totalPages: number
): number[] {
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    throw new Error('PDF 页数不正确。')
  }

  const normalized = pageSelection?.trim()
  if (!normalized || normalized.toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_value, index) => index)
  }

  const selected = new Set<number>()
  const pageIndexes: number[] = []
  const tokens = normalized.split(',').map((token) => token.trim()).filter(Boolean)

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d*)$/)
    const singleMatch = token.match(/^\d+$/)

    if (singleMatch) {
      appendPageNumber(Number(token), totalPages, selected, pageIndexes)
      continue
    }

    if (rangeMatch) {
      const startPage = Number(rangeMatch[1])
      const endPage = rangeMatch[2] ? Number(rangeMatch[2]) : totalPages
      if (startPage > endPage) {
        throw new Error('页码范围不正确，请确认起始页不大于结束页。')
      }
      for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
        appendPageNumber(pageNumber, totalPages, selected, pageIndexes)
      }
      continue
    }

    throw new Error('页码格式不正确，请使用 1,3-5,8- 这样的格式。')
  }

  if (pageIndexes.length === 0) {
    throw new Error('未选择任何页面。')
  }

  return pageIndexes
}

function appendPageNumber(
  pageNumber: number,
  totalPages: number,
  selected: Set<number>,
  pageIndexes: number[]
): void {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error('页码必须从 1 开始。')
  }
  if (pageNumber > totalPages) {
    throw new Error(`页码 ${pageNumber} 超出 PDF 总页数 ${totalPages}。`)
  }

  const pageIndex = pageNumber - 1
  if (selected.has(pageIndex)) {
    return
  }
  selected.add(pageIndex)
  pageIndexes.push(pageIndex)
}
