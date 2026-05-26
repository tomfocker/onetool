import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileImage,
  FileMinus,
  FileOutput,
  FileText,
  Files,
  FolderOpen,
  Image,
  Loader2,
  RefreshCw,
  RotateCw,
  Scissors,
  UploadCloud,
  type LucideIcon
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  filterPdfToolInputPaths,
  getPdfToolAcceptedExtensions,
  getPdfToolDefaultOutputName,
  getPdfToolModeLabel,
  PdfToolConvertResult,
  PdfToolMode,
  PdfToolRotationDegrees
} from '../../../shared/pdfTools'

type ModeOption = {
  id: PdfToolMode
  title: string
  subtitle: string
  icon: LucideIcon
}

const modeOptions: ModeOption[] = [
  {
    id: 'images-to-pdf',
    title: '图片转 PDF',
    subtitle: 'PNG / JPG',
    icon: Image
  },
  {
    id: 'pdf-to-images',
    title: 'PDF 转图片',
    subtitle: '逐页 PNG',
    icon: FileImage
  },
  {
    id: 'merge-pdfs',
    title: '合并 PDF',
    subtitle: '多文件合并',
    icon: Files
  },
  {
    id: 'split-pdf',
    title: '拆分 PDF',
    subtitle: '按页拆开',
    icon: Scissors
  },
  {
    id: 'extract-pages',
    title: '提取页面',
    subtitle: '保留指定页',
    icon: FileOutput
  },
  {
    id: 'delete-pages',
    title: '删除页面',
    subtitle: '移除指定页',
    icon: FileMinus
  },
  {
    id: 'rotate-pages',
    title: '旋转页面',
    subtitle: '90 / 180 / 270',
    icon: RotateCw
  }
]

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '未知大小'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function getPathName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

function getPathDirectory(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return index >= 0 ? filePath.slice(0, index) : filePath
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)))
}

function isSinglePdfMode(mode: PdfToolMode): boolean {
  return ['split-pdf', 'extract-pages', 'delete-pages', 'rotate-pages'].includes(mode)
}

function modeUsesPageSelection(mode: PdfToolMode): boolean {
  return ['extract-pages', 'delete-pages', 'rotate-pages'].includes(mode)
}

function getPageSelectionHint(mode: PdfToolMode): string {
  if (mode === 'delete-pages') return '例如 2,4-6，删除后至少保留 1 页'
  if (mode === 'rotate-pages') return '例如 1,3-5，留空代表全部页面'
  return '例如 1,3-5,8-，留空代表全部页面'
}

export default function PdfTool(): React.JSX.Element {
  const [mode, setMode] = useState<PdfToolMode>('images-to-pdf')
  const [inputPaths, setInputPaths] = useState<string[]>([])
  const [outputDirectory, setOutputDirectory] = useState('')
  const [outputName, setOutputName] = useState(getPdfToolDefaultOutputName('images-to-pdf', []))
  const [outputNameTouched, setOutputNameTouched] = useState(false)
  const [imageScale, setImageScale] = useState(2)
  const [pageSelection, setPageSelection] = useState('')
  const [rotationDegrees, setRotationDegrees] = useState<PdfToolRotationDegrees>(90)
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PdfToolConvertResult | null>(null)

  const acceptedExtensions = useMemo(() => getPdfToolAcceptedExtensions(mode), [mode])
  const canConvert = inputPaths.length > 0 && !busy

  const applyInputPaths = (paths: string[], nextMode = mode, keepExisting = false) => {
    const combined = keepExisting ? [...inputPaths, ...paths] : paths
    const filtered = uniquePaths(filterPdfToolInputPaths(nextMode, combined))
    const nextPaths = isSinglePdfMode(nextMode) ? filtered.slice(0, 1) : filtered

    setInputPaths(nextPaths)
    setError(nextPaths.length > 0 ? null : `请选择 ${getPdfToolAcceptedExtensions(nextMode).join(' / ').toUpperCase()} 文件`)
    setResult(null)

    if (!outputNameTouched) {
      setOutputName(getPdfToolDefaultOutputName(nextMode, nextPaths))
    }
  }

  const handleModeChange = (nextMode: PdfToolMode) => {
    setMode(nextMode)
    setOutputNameTouched(false)
    setResult(null)
    setError(null)
    const filtered = uniquePaths(filterPdfToolInputPaths(nextMode, inputPaths))
    const nextPaths = isSinglePdfMode(nextMode) ? filtered.slice(0, 1) : filtered
    setInputPaths(nextPaths)
    setOutputName(getPdfToolDefaultOutputName(nextMode, nextPaths))
    setPageSelection(nextMode === 'delete-pages' ? '' : '1-')
  }

  const handleChooseFiles = async () => {
    setError(null)
    const response = await window.electron.pdfTools.chooseFiles(mode)
    if (!response.success) {
      setError(response.error || '选择文件失败')
      return
    }
    if (response.data?.canceled) {
      return
    }
    applyInputPaths(response.data?.paths || [])
  }

  const handleChooseOutputDirectory = async () => {
    setError(null)
    const response = await window.electron.pdfTools.chooseOutputDirectory()
    if (!response.success) {
      setError(response.error || '选择输出位置失败')
      return
    }
    if (response.data?.path) {
      setOutputDirectory(response.data.path)
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.electron.webUtils.getPathForFile(file))
      .filter(Boolean)
    applyInputPaths(paths, mode, true)
  }

  const handleConvert = async () => {
    if (!canConvert) {
      setError('请先添加要处理的文件')
      return
    }
    if (mode === 'delete-pages' && !pageSelection.trim()) {
      setError('请输入要删除的页码范围')
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)

    const response = await window.electron.pdfTools.convert({
      mode,
      inputPaths,
      outputDirectory: outputDirectory.trim() || undefined,
      outputName: outputName.trim() || undefined,
      imageScale,
      pageSelection: pageSelection.trim() || undefined,
      rotationDegrees
    })

    setBusy(false)
    if (!response.success || !response.data) {
      setError(response.error || '转换失败')
      return
    }

    setResult(response.data)
    setOutputDirectory(response.data.outputDirectory)
  }

  const handleOpenOutput = async (targetPath?: string) => {
    const pathToOpen = targetPath || result?.outputDirectory || outputDirectory
    if (!pathToOpen) return
    await window.electron.pdfTools.openPath(pathToOpen)
  }

  const handleClear = () => {
    setInputPaths([])
    setResult(null)
    setError(null)
    setOutputNameTouched(false)
    setOutputName(getPdfToolDefaultOutputName(mode, []))
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-3 border-b border-zinc-200/70 pb-6 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-950 dark:text-zinc-50">
              PDF 处理
            </h1>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              本地完成 PDF 与图片转换，文件不离开当前电脑。
            </p>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-zinc-200 bg-white/85 p-5 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.45)] dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {modeOptions.map((option) => {
              const Icon = option.icon
              const active = option.id === mode
              return (
                <button
                  key={option.id}
                  onClick={() => handleModeChange(option.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all active:scale-[0.98]',
                    active
                      ? 'border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                      : 'border-zinc-200 bg-zinc-50/80 text-zinc-800 hover:border-blue-200 hover:bg-blue-50 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                      active ? 'bg-white/15' : 'bg-white text-blue-600 dark:bg-zinc-950'
                    )}
                  >
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{option.title}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-xs font-bold',
                        active ? 'text-white/75' : 'text-muted-foreground'
                      )}
                    >
                      {option.subtitle}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div
            className={cn(
              'mt-5 flex min-h-[260px] flex-col items-center justify-center rounded-[1.75rem] border-2 border-dashed px-6 py-10 text-center transition-all',
              dragActive
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30'
                : 'border-zinc-200 bg-zinc-50/60 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-300'
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white text-blue-600 shadow-sm dark:bg-zinc-950">
              <UploadCloud size={28} />
            </div>
            <h2 className="mt-5 text-xl font-black text-zinc-950 dark:text-zinc-50">
              拖入文件或直接选择
            </h2>
            <p className="mt-2 text-sm font-bold text-muted-foreground">
              当前模式：{getPdfToolModeLabel(mode)}，支持 {acceptedExtensions.join(' / ').toUpperCase()}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button onClick={handleChooseFiles} className="h-11 rounded-2xl px-5 font-black">
                <FolderOpen className="mr-2 h-4 w-4" />
                选择文件
              </Button>
              {inputPaths.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleClear}
                  className="h-11 rounded-2xl px-5 font-black"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  清空列表
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">待处理文件</h3>
              <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
                {inputPaths.length} 个
              </Badge>
            </div>
            {inputPaths.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-5 text-sm font-bold text-muted-foreground dark:border-zinc-800 dark:bg-zinc-950">
                文件列表为空
              </div>
            ) : (
              <div className="max-h-[260px] divide-y divide-zinc-100 overflow-y-auto rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                {inputPaths.map((filePath) => (
                  <div key={filePath} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                      {mode === 'images-to-pdf' ? <Image size={18} /> : <FileText size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">
                        {getPathName(filePath)}
                      </div>
                      <div className="truncate text-xs font-bold text-muted-foreground">
                        {getPathDirectory(filePath)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-zinc-200 bg-white/85 p-5 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.45)] dark:border-zinc-800 dark:bg-zinc-950/70">
            <h2 className="text-base font-black text-zinc-950 dark:text-zinc-50">输出设置</h2>
            <div className="mt-4 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  输出目录
                </span>
                <div className="flex gap-2">
                  <Input
                    value={outputDirectory}
                    onChange={(event) => setOutputDirectory(event.target.value)}
                    placeholder="默认保存到首个文件所在目录"
                    className="h-11 rounded-2xl font-bold"
                  />
                  <Button
                    variant="outline"
                    onClick={handleChooseOutputDirectory}
                    className="h-11 rounded-2xl px-4"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  输出名称
                </span>
                <Input
                  value={outputName}
                  onChange={(event) => {
                    setOutputNameTouched(true)
                    setOutputName(event.target.value)
                  }}
                  className="h-11 rounded-2xl font-bold"
                />
              </label>

              {mode === 'pdf-to-images' && (
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    图片清晰度
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map((scale) => (
                      <button
                        key={scale}
                        onClick={() => setImageScale(scale)}
                        className={cn(
                          'h-10 rounded-2xl border text-sm font-black transition-all active:scale-[0.98]',
                          imageScale === scale
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-blue-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
                        )}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </label>
              )}

              {modeUsesPageSelection(mode) && (
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    页码范围
                  </span>
                  <Input
                    value={pageSelection}
                    onChange={(event) => setPageSelection(event.target.value)}
                    placeholder="1,3-5,8-"
                    className="h-11 rounded-2xl font-bold"
                  />
                  <span className="block text-xs font-bold text-muted-foreground">
                    {getPageSelectionHint(mode)}
                  </span>
                </label>
              )}

              {mode === 'rotate-pages' && (
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                    旋转角度
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {([90, 180, 270] as PdfToolRotationDegrees[]).map((degrees) => (
                      <button
                        key={degrees}
                        onClick={() => setRotationDegrees(degrees)}
                        className={cn(
                          'h-10 rounded-2xl border text-sm font-black transition-all active:scale-[0.98]',
                          rotationDegrees === degrees
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-blue-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
                        )}
                      >
                        {degrees}°
                      </button>
                    ))}
                  </div>
                </label>
              )}

              <Button
                onClick={handleConvert}
                disabled={!canConvert}
                className="h-12 w-full rounded-2xl bg-blue-600 text-sm font-black hover:bg-blue-700"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在处理
                  </>
                ) : (
                  <>
                    开始转换
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-zinc-200 bg-white/85 p-5 dark:border-zinc-800 dark:bg-zinc-950/70">
            <h2 className="text-base font-black text-zinc-950 dark:text-zinc-50">结果</h2>
            {error && (
              <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm font-bold">{error}</div>
              </div>
            )}
            {!error && !result && (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm font-bold text-muted-foreground dark:border-zinc-800 dark:bg-zinc-900/60">
                完成后会在这里显示输出文件
              </div>
            )}
            {result && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div className="text-sm font-black">{result.message}</div>
                </div>
                <div className="max-h-[240px] divide-y divide-zinc-100 overflow-y-auto rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                  {result.outputFiles.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => handleOpenOutput(file.path)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                        {file.kind === 'pdf' ? <FileText size={18} /> : <Image size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-zinc-900 dark:text-zinc-100">
                          {file.name}
                        </div>
                        <div className="text-xs font-bold text-muted-foreground">
                          {formatBytes(file.sizeBytes)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleOpenOutput()}
                  className="h-11 w-full rounded-2xl font-black"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  打开输出目录
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-zinc-950 dark:text-zinc-50">
                  后续接入
                </h2>
                <p className="mt-1 text-xs font-bold text-muted-foreground">
                  Office 转 PDF、PDF 转 Word、OCR 可搜索 PDF
                </p>
              </div>
              <Badge variant="secondary" className="rounded-full px-3 py-1 font-black">
                待启用
              </Badge>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
