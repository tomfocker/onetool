import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FolderOpen,
  ImagePlus,
  Loader2,
  RefreshCw,
  Square,
  Table2,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  TableOcrRecognizeRequest,
  TableOcrRecognizeResult,
  TableOcrRuntimeStatus
} from '../../../shared/tableOcr'

function getFileLabel(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

export default function TableOcrTool() {
  const [runtimeStatus, setRuntimeStatus] = useState<TableOcrRuntimeStatus | null>(null)
  const [inputPath, setInputPath] = useState('')
  const [outputDirectory, setOutputDirectory] = useState('')
  const [result, setResult] = useState<TableOcrRecognizeResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const capturePendingRef = useRef(false)

  const loadStatus = useCallback(async () => {
    if (!window.electron?.tableOcr) return
    setIsChecking(true)
    try {
      const response = await window.electron.tableOcr.getStatus()
      if (response.success && response.data) {
        setRuntimeStatus(response.data)
      } else {
        setError(response.error || '表格 OCR 运行时检查失败')
      }
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const tableOcr = window.electron?.tableOcr
    if (!tableOcr?.onStateChanged) return

    return tableOcr.onStateChanged((nextState) => {
      setRuntimeStatus(nextState)
      if (nextState.installStatus === 'success') {
        window.setTimeout(() => void loadStatus(), 500)
      }
    })
  }, [loadStatus])

  const runRecognize = useCallback(async (request: TableOcrRecognizeRequest) => {
    if (!window.electron?.tableOcr) return
    if (runtimeStatus && !runtimeStatus.ready) {
      setError('表格 OCR 运行时尚未就绪')
      return
    }

    setIsRecognizing(true)
    setError(null)
    setResult(null)
    try {
      const response = await window.electron.tableOcr.recognize({
        ...request,
        outputDirectory: outputDirectory.trim() || undefined
      })

      if (!response.success || !response.data) {
        setError(response.error || '表格识别失败')
        return
      }

      setResult(response.data)
      setOutputDirectory(response.data.outputDirectory)
    } catch (caughtError) {
      setError((caughtError as Error).message)
    } finally {
      setIsRecognizing(false)
    }
  }, [outputDirectory, runtimeStatus])

  useEffect(() => {
    if (!window.electron?.screenshot) return

    const unsubscribe = window.electron.screenshot.onSelectionResult(async (bounds) => {
      if (!capturePendingRef.current) return

      capturePendingRef.current = false
      setIsCapturing(false)
      if (!bounds) return

      const capture = await window.electron.screenshot.capture(bounds)
      if (!capture.success || !capture.data) {
        setError(capture.error || '截图失败')
        return
      }

      await runRecognize({
        imageDataUrl: capture.data,
        fileName: `screenshot-${Date.now()}.png`
      })
    })

    return () => unsubscribe()
  }, [runRecognize])

  const handleChooseImage = async () => {
    const response = await window.electron.tableOcr.chooseImage()
    if (response.success && response.data?.path) {
      setInputPath(response.data.path)
      setResult(null)
      setError(null)
    }
  }

  const handleChooseOutputDirectory = async () => {
    const response = await window.electron.tableOcr.chooseOutputDirectory()
    if (response.success && response.data?.path) {
      setOutputDirectory(response.data.path)
    }
  }

  const handlePrepareRuntime = async () => {
    setError(null)
    const response = await window.electron.tableOcr.prepareRuntime()
    if (response.success && response.data) {
      setRuntimeStatus(response.data)
    } else {
      setError(response.error || '运行时准备启动失败')
    }
  }

  const handleCancelPrepare = async () => {
    const response = await window.electron.tableOcr.cancelPrepare()
    if (response.success && response.data) {
      setRuntimeStatus(response.data)
    } else {
      setError(response.error || '取消运行时准备失败')
    }
  }

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const resolvedPath = window.electron.webUtils.getPathForFile(file)
    if (!resolvedPath) {
      setError('无法读取图片路径')
      return
    }

    setInputPath(resolvedPath)
    setResult(null)
    setError(null)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'))
    if (!file) {
      setError('请拖入图片文件')
      return
    }

    const resolvedPath = window.electron.webUtils.getPathForFile(file)
    if (!resolvedPath) {
      setError('无法读取图片路径')
      return
    }

    setInputPath(resolvedPath)
    setResult(null)
    setError(null)
  }

  const handleRecognizeFile = () => {
    if (!inputPath) {
      setError('请选择图片后再开始识别')
      return
    }
    void runRecognize({ inputPath })
  }

  const handleCapture = async () => {
    if (!window.electron?.screenshot) return
    capturePendingRef.current = true
    setIsCapturing(true)
    setError(null)
    await window.electron.screenshot.openSelection(null, false)
  }

  const isPreparingRuntime = runtimeStatus?.installStatus === 'running'
  const canRun = Boolean(runtimeStatus?.ready) && !isRecognizing && !isCapturing && !isPreparingRuntime
  const missingText = runtimeStatus?.missingPackages?.join('、') || runtimeStatus?.missingRuntimeFiles?.join('、')
  const runtimeLogs = runtimeStatus?.logs ?? []

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">表格识别</h1>
              <p className="text-sm text-muted-foreground">Table OCR to Excel</p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => void loadStatus()} disabled={isChecking} className="gap-2">
          {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          刷新状态
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 space-y-5">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black">
                <ImagePlus className="w-4 h-4 text-emerald-500" />
                输入
              </CardTitle>
              <CardDescription>支持本地图片和屏幕区域截图。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'h-44 rounded-2xl border border-dashed flex items-center justify-center cursor-pointer transition-all bg-white/50 dark:bg-white/5',
                  isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-border hover:border-emerald-500/50'
                )}
              >
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{inputPath ? getFileLabel(inputPath) : '拖入图片或点击选择'}</p>
                    <p className="text-xs text-muted-foreground mt-1">{inputPath || 'PNG / JPG / WEBP / BMP / TIFF'}</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button variant="outline" onClick={handleChooseImage} className="gap-2">
                  <FolderOpen className="w-4 h-4" />
                  选择图片
                </Button>
                <Button variant="outline" onClick={handleCapture} disabled={!canRun} className="gap-2">
                  {isCapturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  截图识别
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">输出目录</label>
                <div className="flex gap-2">
                  <Input
                    value={outputDirectory}
                    onChange={(event) => setOutputDirectory(event.target.value)}
                    placeholder="默认保存到下载目录"
                  />
                  <Button variant="outline" onClick={handleChooseOutputDirectory}>
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Button onClick={handleRecognizeFile} disabled={!canRun || !inputPath} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
                {isRecognizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {isRecognizing ? '识别中' : '生成 Excel'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-5 space-y-5">
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black">
                {runtimeStatus?.ready ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
                运行时
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {runtimeStatus?.ready ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  本地表格 OCR 已就绪
                </div>
              ) : isPreparingRuntime ? (
                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-300">
                  <div className="font-bold flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在准备本地运行时
                  </div>
                  <div className="mt-1 text-xs leading-5 opacity-90">第一次会下载并安装 PaddleOCR，本机完成后后续可离线识别。</div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                  <div className="font-bold">运行时未就绪</div>
                  <div className="mt-1 text-xs leading-5 opacity-90">{missingText || '正在检查依赖'}</div>
                </div>
              )}

              {!runtimeStatus?.ready && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button onClick={() => void handlePrepareRuntime()} disabled={isPreparingRuntime} className="gap-2 bg-sky-600 hover:bg-sky-700">
                    {isPreparingRuntime ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    准备本地运行时
                  </Button>
                  <Button variant="outline" onClick={() => void handleCancelPrepare()} disabled={!isPreparingRuntime} className="gap-2">
                    <Square className="w-4 h-4" />
                    取消
                  </Button>
                </div>
              )}

              {runtimeLogs.length > 0 && (
                <div className="rounded-2xl border border-zinc-900/10 bg-zinc-950 text-zinc-100 p-3 max-h-52 overflow-y-auto font-mono text-[11px] leading-5">
                  {runtimeLogs.slice(-80).map((item) => (
                    <div key={item.id} className="flex gap-2">
                      <span className="text-zinc-500 shrink-0">{new Date(item.timestamp).toLocaleTimeString('zh-CN')}</span>
                      <span
                        className={
                          item.level === 'error'
                            ? 'text-red-400'
                            : item.level === 'success'
                              ? 'text-emerald-400'
                              : item.level === 'progress'
                                ? 'text-sky-300'
                                : 'text-zinc-200'
                        }
                      >
                        {item.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                输出
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                  {error}
                </div>
              )}

              {!result && !error && (
                <div className="rounded-2xl border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                  等待生成 Excel
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black truncate">{getFileLabel(result.outputPath)}</p>
                        <p className="text-xs text-muted-foreground truncate">{result.outputPath}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Button onClick={() => void window.electron.tableOcr.openPath(result.outputPath)} className="gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      打开 Excel
                    </Button>
                    <Button variant="outline" onClick={() => void window.electron.tableOcr.openPath(result.outputDirectory)} className="gap-2">
                      <FolderOpen className="w-4 h-4" />
                      打开目录
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
