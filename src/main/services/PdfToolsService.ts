import { shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { degrees, PDFDocument } from 'pdf-lib'
import {
  filterPdfToolInputPaths,
  getPdfToolDefaultOutputName,
  getPdfToolInputKind,
  normalizePdfToolImageScale,
  parsePdfToolPageSelection,
  PdfToolConvertRequest,
  PdfToolConvertResult,
  PdfToolMode,
  PdfToolOutputFile,
  PdfToolRotationDegrees
} from '../../shared/pdfTools'
import type { IpcResponse } from '../../shared/types'

type FileSystemPromises = Pick<
  typeof fs,
  'readFile' | 'writeFile' | 'mkdir' | 'stat'
>

type PdfDocumentFactory = Pick<typeof PDFDocument, 'create' | 'load'>
type PdfToImageFactory = (
  input: string,
  options?: { scale?: number }
) => Promise<AsyncIterable<Buffer | Uint8Array> & { destroy?: () => Promise<void> | void }>
type PdfToImageLoader = () => Promise<{ pdf: PdfToImageFactory }>

interface PdfToolsServiceDependencies {
  fsPromises?: FileSystemPromises
  pdfDocument?: PdfDocumentFactory
  pdfToImageLoader?: PdfToImageLoader
  shellModule?: Pick<typeof shell, 'openPath'>
}

const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string
) => Promise<T>

async function loadPdfToImg(): Promise<{ pdf: PdfToImageFactory }> {
  return dynamicImport<{ pdf: PdfToImageFactory }>('pdf-to-img')
}

function toIpcError(error: unknown): IpcResponse<never> {
  const message = error instanceof Error ? error.message : String(error)
  return { success: false, error: message }
}

function sanitizeOutputName(outputName: string): string {
  const sanitized = outputName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || 'converted'
}

function getOutputPath(outputDirectory: string, outputName: string, extension: string): string {
  const safeOutputName = sanitizeOutputName(outputName).replace(/\.+$/, '')
  return path.join(outputDirectory, `${safeOutputName}.${extension}`)
}

function padPageNumber(pageNumber: number): string {
  return String(pageNumber).padStart(3, '0')
}

export class PdfToolsService {
  private readonly fsPromises: FileSystemPromises
  private readonly pdfDocument: PdfDocumentFactory
  private readonly pdfToImageLoader: PdfToImageLoader
  private readonly shellModule: Pick<typeof shell, 'openPath'>

  constructor(dependencies: PdfToolsServiceDependencies = {}) {
    this.fsPromises = dependencies.fsPromises ?? fs
    this.pdfDocument = dependencies.pdfDocument ?? PDFDocument
    this.pdfToImageLoader = dependencies.pdfToImageLoader ?? loadPdfToImg
    this.shellModule = dependencies.shellModule ?? shell
  }

  async convert(request: PdfToolConvertRequest): Promise<IpcResponse<PdfToolConvertResult>> {
    try {
      const result = await this.convertOrThrow(request)
      return { success: true, data: result }
    } catch (error) {
      return toIpcError(error)
    }
  }

  async openPath(targetPath: string): Promise<IpcResponse<{ targetPath: string }>> {
    try {
      const openError = await this.shellModule.openPath(targetPath)
      if (openError) {
        throw new Error(openError)
      }
      return { success: true, data: { targetPath } }
    } catch (error) {
      return toIpcError(error)
    }
  }

  private async convertOrThrow(request: PdfToolConvertRequest): Promise<PdfToolConvertResult> {
    const mode = request.mode
    const inputPaths = filterPdfToolInputPaths(mode, request.inputPaths || [])
    if (inputPaths.length === 0) {
      throw new Error(this.getNoInputMessage(mode))
    }

    const outputDirectory =
      request.outputDirectory?.trim() || path.dirname(inputPaths[0]) || process.cwd()
    const outputName = sanitizeOutputName(
      request.outputName || getPdfToolDefaultOutputName(mode, inputPaths)
    )

    await this.fsPromises.mkdir(outputDirectory, { recursive: true })

    if (mode === 'images-to-pdf') {
      return this.convertImagesToPdf(inputPaths, outputDirectory, outputName)
    }

    if (mode === 'merge-pdfs') {
      return this.mergePdfs(inputPaths, outputDirectory, outputName)
    }

    if (mode === 'split-pdf') {
      return this.splitPdf(inputPaths[0], outputDirectory, outputName)
    }

    if (mode === 'extract-pages') {
      return this.extractPages(inputPaths[0], outputDirectory, outputName, request.pageSelection)
    }

    if (mode === 'delete-pages') {
      return this.deletePages(inputPaths[0], outputDirectory, outputName, request.pageSelection)
    }

    if (mode === 'rotate-pages') {
      return this.rotatePages(
        inputPaths[0],
        outputDirectory,
        outputName,
        request.pageSelection,
        request.rotationDegrees ?? 90
      )
    }

    return this.convertPdfToImages(
      inputPaths,
      outputDirectory,
      outputName,
      normalizePdfToolImageScale(request.imageScale)
    )
  }

  private async convertImagesToPdf(
    inputPaths: string[],
    outputDirectory: string,
    outputName: string
  ): Promise<PdfToolConvertResult> {
    const document = await this.pdfDocument.create()

    for (const inputPath of inputPaths) {
      const bytes = await this.fsPromises.readFile(inputPath)
      const kind = getPdfToolInputKind(inputPath)
      if (kind !== 'image') {
        continue
      }

      const extension = path.extname(inputPath).toLowerCase()
      const embeddedImage =
        extension === '.jpg' || extension === '.jpeg'
          ? await document.embedJpg(bytes)
          : await document.embedPng(bytes)
      const page = document.addPage([embeddedImage.width, embeddedImage.height])
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: embeddedImage.width,
        height: embeddedImage.height
      })
    }

    const outputPath = getOutputPath(outputDirectory, outputName, 'pdf')
    const pdfBytes = await document.save()
    await this.fsPromises.writeFile(outputPath, pdfBytes)

    return {
      mode: 'images-to-pdf',
      outputDirectory,
      outputFiles: [await this.createOutputFile(outputPath, 'pdf')],
      message: `已生成 1 个 PDF 文件`
    }
  }

  private async mergePdfs(
    inputPaths: string[],
    outputDirectory: string,
    outputName: string
  ): Promise<PdfToolConvertResult> {
    const targetDocument = await this.pdfDocument.create()

    for (const inputPath of inputPaths) {
      const sourceBytes = await this.fsPromises.readFile(inputPath)
      const sourceDocument = await this.pdfDocument.load(sourceBytes)
      const pages = await targetDocument.copyPages(sourceDocument, sourceDocument.getPageIndices())
      pages.forEach((page) => targetDocument.addPage(page))
    }

    const outputPath = getOutputPath(outputDirectory, outputName, 'pdf')
    const pdfBytes = await targetDocument.save()
    await this.fsPromises.writeFile(outputPath, pdfBytes)

    return {
      mode: 'merge-pdfs',
      outputDirectory,
      outputFiles: [await this.createOutputFile(outputPath, 'pdf')],
      message: `已合并 ${inputPaths.length} 个 PDF 文件`
    }
  }

  private async convertPdfToImages(
    inputPaths: string[],
    outputDirectory: string,
    outputName: string,
    imageScale: number
  ): Promise<PdfToolConvertResult> {
    const { pdf } = await this.pdfToImageLoader()
    const outputFiles: PdfToolOutputFile[] = []

    for (const inputPath of inputPaths) {
      const sourceBaseName = sanitizeOutputName(path.basename(inputPath, path.extname(inputPath)))
      const outputStem =
        inputPaths.length > 1 ? `${outputName}-${sourceBaseName}` : outputName
      const document = await pdf(inputPath, { scale: imageScale })

      try {
        let pageNumber = 1
        for await (const imageBytes of document) {
          const outputPath = path.join(
            outputDirectory,
            `${sanitizeOutputName(outputStem)}-page-${padPageNumber(pageNumber)}.png`
          )
          await this.fsPromises.writeFile(outputPath, imageBytes)
          outputFiles.push(await this.createOutputFile(outputPath, 'image'))
          pageNumber += 1
        }
      } finally {
        await document.destroy?.()
      }
    }

    return {
      mode: 'pdf-to-images',
      outputDirectory,
      outputFiles,
      message: `已导出 ${outputFiles.length} 张图片`
    }
  }

  private async splitPdf(
    inputPath: string,
    outputDirectory: string,
    outputName: string
  ): Promise<PdfToolConvertResult> {
    const sourceDocument = await this.loadPdfDocument(inputPath)
    const pageIndices = sourceDocument.getPageIndices()
    const outputFiles: PdfToolOutputFile[] = []

    for (const pageIndex of pageIndices) {
      const targetDocument = await this.pdfDocument.create()
      const [copiedPage] = await targetDocument.copyPages(sourceDocument, [pageIndex])
      targetDocument.addPage(copiedPage)
      const outputPath = path.join(
        outputDirectory,
        `${sanitizeOutputName(outputName)}-page-${padPageNumber(pageIndex + 1)}.pdf`
      )
      await this.fsPromises.writeFile(outputPath, await targetDocument.save())
      outputFiles.push(await this.createOutputFile(outputPath, 'pdf'))
    }

    return {
      mode: 'split-pdf',
      outputDirectory,
      outputFiles,
      message: `已拆分为 ${outputFiles.length} 个 PDF 文件`
    }
  }

  private async extractPages(
    inputPath: string,
    outputDirectory: string,
    outputName: string,
    pageSelection: string | undefined
  ): Promise<PdfToolConvertResult> {
    const sourceDocument = await this.loadPdfDocument(inputPath)
    const pageIndices = parsePdfToolPageSelection(pageSelection, sourceDocument.getPageIndices().length)
    const targetDocument = await this.pdfDocument.create()
    const pages = await targetDocument.copyPages(sourceDocument, pageIndices)
    pages.forEach((page) => targetDocument.addPage(page))

    const outputPath = getOutputPath(outputDirectory, outputName, 'pdf')
    await this.fsPromises.writeFile(outputPath, await targetDocument.save())

    return {
      mode: 'extract-pages',
      outputDirectory,
      outputFiles: [await this.createOutputFile(outputPath, 'pdf')],
      message: `已提取 ${pageIndices.length} 页`
    }
  }

  private async deletePages(
    inputPath: string,
    outputDirectory: string,
    outputName: string,
    pageSelection: string | undefined
  ): Promise<PdfToolConvertResult> {
    const sourceDocument = await this.loadPdfDocument(inputPath)
    const selectedForDeletion = new Set(
      parsePdfToolPageSelection(pageSelection, sourceDocument.getPageIndices().length)
    )
    const remainingPageIndices = sourceDocument
      .getPageIndices()
      .filter((pageIndex) => !selectedForDeletion.has(pageIndex))

    if (remainingPageIndices.length === 0) {
      throw new Error('删除后至少需要保留 1 页。')
    }

    const targetDocument = await this.pdfDocument.create()
    const pages = await targetDocument.copyPages(sourceDocument, remainingPageIndices)
    pages.forEach((page) => targetDocument.addPage(page))

    const outputPath = getOutputPath(outputDirectory, outputName, 'pdf')
    await this.fsPromises.writeFile(outputPath, await targetDocument.save())

    return {
      mode: 'delete-pages',
      outputDirectory,
      outputFiles: [await this.createOutputFile(outputPath, 'pdf')],
      message: `已删除 ${selectedForDeletion.size} 页`
    }
  }

  private async rotatePages(
    inputPath: string,
    outputDirectory: string,
    outputName: string,
    pageSelection: string | undefined,
    rotationDegrees: PdfToolRotationDegrees
  ): Promise<PdfToolConvertResult> {
    const sourceDocument = await this.loadPdfDocument(inputPath)
    const selectedForRotation = new Set(
      parsePdfToolPageSelection(pageSelection, sourceDocument.getPageIndices().length)
    )
    const sourcePageIndices = sourceDocument.getPageIndices()
    const targetDocument = await this.pdfDocument.create()
    const pages = await targetDocument.copyPages(sourceDocument, sourcePageIndices)

    pages.forEach((page, index) => {
      const sourcePageIndex = sourcePageIndices[index]
      if (selectedForRotation.has(sourcePageIndex)) {
        page.setRotation(degrees(rotationDegrees))
      }
      targetDocument.addPage(page)
    })

    const outputPath = getOutputPath(outputDirectory, outputName, 'pdf')
    await this.fsPromises.writeFile(outputPath, await targetDocument.save())

    return {
      mode: 'rotate-pages',
      outputDirectory,
      outputFiles: [await this.createOutputFile(outputPath, 'pdf')],
      message: `已旋转 ${selectedForRotation.size} 页`
    }
  }

  private async loadPdfDocument(inputPath: string) {
    const sourceBytes = await this.fsPromises.readFile(inputPath)
    const sourceDocument = await this.pdfDocument.load(sourceBytes)
    const pageIndices = sourceDocument.getPageIndices()
    if (pageIndices.length === 0) {
      throw new Error('PDF 中没有可处理的页面。')
    }
    return sourceDocument
  }

  private async createOutputFile(
    outputPath: string,
    kind: PdfToolOutputFile['kind']
  ): Promise<PdfToolOutputFile> {
    let sizeBytes: number | null = null
    try {
      const stats = await this.fsPromises.stat(outputPath)
      sizeBytes = stats.size
    } catch {
      sizeBytes = null
    }

    return {
      path: outputPath,
      name: path.basename(outputPath),
      kind,
      sizeBytes
    }
  }

  private getNoInputMessage(mode: PdfToolMode): string {
    if (mode === 'images-to-pdf') {
      return '没有可转换的图片文件，请选择 PNG、JPG 或 JPEG。'
    }
    return '没有可转换的 PDF 文件，请选择 PDF 后再试。'
  }
}

export const pdfToolsService = new PdfToolsService()
