import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  resolveImageOutputLayout,
  sanitizePixelInput,
  type ImageOutputLayout,
  type CustomResizeMode,
  type ImageDimensionMethod
} from './imageProcessorModel'
import { createImageProcessorZip } from './imageProcessorArchive'
import {
  createIcoBlobFromPngBlob,
  encodeWithTargetQuality,
  getTargetWeightBytes,
  isQualityAdjustableFormat,
  resolveIcoCanvasSize,
  type TargetWeightUnit
} from './imageProcessorEncoding'

type CompressMethod = 'quality' | 'limitWeight'
type ConvertFormat = 'default' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/vnd.microsoft.icon'

interface ProcessedImage {
  id: string
  originalFile: File
  processedBlob: Blob
  thumbnailUrl: string
  outputUrl: string
  fileName: string
  width: number
  height: number
  originalSize: number
  processedSize: number
}

const animationStyles = `
  @keyframes border-dance {
    0% { background-position: 0% 0%, 100% 100%, 0% 100%, 100% 0%; }
    25% { background-position: 100% 0%, 0% 100%, 0% 0%, 100% 100%; }
    50% { background-position: 100% 100%, 0% 0%, 100% 0%, 0% 100%; }
    75% { background-position: 0% 100%, 100% 0%, 100% 100%, 0% 0%; }
    100% { background-position: 0% 0%, 100% 100%, 0% 100%, 100% 0%; }
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-6px); }
  }

  @keyframes pulse-ring {
    0% { transform: scale(0.95); opacity: 1; }
    50% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(0.95); opacity: 1; }
  }

  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes fade-in-up {
    0% { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes scale-in {
    0% { opacity: 0; transform: scale(0.95); }
    100% { opacity: 1; transform: scale(1); }
  }

  @keyframes slide-in-right {
    0% { opacity: 0; transform: translateX(16px); }
    100% { opacity: 1; transform: translateX(0); }
  }

  .animate-float { animation: float 3s ease-in-out infinite; will-change: transform; }
  .animate-pulse-ring { animation: pulse-ring 2s ease-in-out infinite; will-change: transform, opacity; }
  .animate-shimmer { 
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    background-size: 200% 100%;
    animation: shimmer 2s infinite;
    will-change: background-position;
  }
  .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; will-change: opacity, transform; }
  .animate-scale-in { animation: scale-in 0.25s ease-out forwards; will-change: opacity, transform; }
  .animate-slide-in-right { animation: slide-in-right 0.3s ease-out forwards; will-change: opacity, transform; }
`

const TARGET_RESIZE_ATTEMPTS = 8
const MIN_TARGET_SCALE = 0.35

function createCanvasBlob(canvas: HTMLCanvasElement, format: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('压缩失败'))
      }
    }, format, quality)
  })
}

function drawImageToCanvas(
  img: HTMLImageElement,
  layout: ImageOutputLayout,
  outputFormat: string,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('无法获取 canvas 上下文')
  }

  const scaleX = width / layout.canvasWidth
  const scaleY = height / layout.canvasHeight

  canvas.width = width
  canvas.height = height

  if (outputFormat === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }

  ctx.drawImage(
    img,
    layout.sourceX,
    layout.sourceY,
    layout.sourceWidth,
    layout.sourceHeight,
    Math.round(layout.drawX * scaleX),
    Math.round(layout.drawY * scaleY),
    Math.max(1, Math.round(layout.drawWidth * scaleX)),
    Math.max(1, Math.round(layout.drawHeight * scaleY))
  )

  return canvas
}

async function encodeCanvasOutput(
  canvas: HTMLCanvasElement,
  outputFormat: string,
  initialQuality: number,
  targetBytes: number | null
): Promise<{ blob: Blob; reachedTarget: boolean }> {
  if (targetBytes && isQualityAdjustableFormat(outputFormat)) {
    const result = await encodeWithTargetQuality(
      (qualityValue) => createCanvasBlob(canvas, outputFormat, qualityValue),
      {
        initialQuality,
        targetBytes,
        minQuality: 0.1,
        attempts: 8
      }
    )

    return { blob: result.blob, reachedTarget: result.reachedTarget }
  }

  const blob = await createCanvasBlob(canvas, outputFormat, outputFormat === 'image/png' ? 1 : initialQuality)
  return { blob, reachedTarget: targetBytes ? blob.size <= targetBytes : true }
}

async function encodeIcoCanvasOutput(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  targetBytes: number | null
): Promise<{ blob: Blob; reachedTarget: boolean }> {
  const pngBlob = await createCanvasBlob(canvas, 'image/png', 1)
  const icoBlob = await createIcoBlobFromPngBlob(pngBlob, width, height)

  return { blob: icoBlob, reachedTarget: targetBytes ? icoBlob.size <= targetBytes : true }
}

function getNextTargetCanvasSize(width: number, height: number, currentBytes: number, targetBytes: number) {
  const rawScale = Math.sqrt(targetBytes / Math.max(1, currentBytes)) * 0.92
  const scale = Math.max(MIN_TARGET_SCALE, Math.min(0.9, rawScale))

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  }
}

export const ImageProcessorTool: React.FC = () => {
  const [compressMethod, setCompressMethod] = useState<CompressMethod>('quality')
  const [dimensionMethod, setDimensionMethod] = useState<ImageDimensionMethod>('original')
  const [customResizeMode, setCustomResizeMode] = useState<CustomResizeMode>('fit')
  const [convertFormat, setConvertFormat] = useState<ConvertFormat>('default')
  const [quality, setQuality] = useState(80)
  const [limitDimensions, setLimitDimensions] = useState(1200)
  const [customWidth, setCustomWidth] = useState(800)
  const [customHeight, setCustomHeight] = useState(800)
  const [limitWeight, setLimitWeight] = useState(2)
  const [limitWeightUnit, setLimitWeightUnit] = useState<TargetWeightUnit>('MB')
  const [currentSubpage, setCurrentSubpage] = useState<'settings' | 'output'>('settings')
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPackaging, setIsPackaging] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingText, setProcessingText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = animationStyles
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  const getFileExtension = (mimeType: string): string => {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/vnd.microsoft.icon': 'ico',
      'image/svg+xml': 'svg',
      'image/gif': 'gif',
      'image/tiff': 'tiff',
    }
    return mimeToExt[mimeType] || 'png'
  }

  const updateFileExtension = (fileName: string, newExt: string, selectedFormat: string): string => {
    const ext = getFileExtension(selectedFormat)
    const baseName = fileName.replace(/\.[^/.]+$/, '')
    return `${baseName}.${ext}`
  }

  const getAdjustedDimensions = (img: HTMLImageElement, limit: number): { width: number; height: number } => {
    const { width, height } = img
    if (width <= limit && height <= limit) {
      return { width, height }
    }
    const ratio = Math.min(limit / width, limit / height)
    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio)
    }
  }

  const compressImage = useCallback(async (file: File): Promise<ProcessedImage | null> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = async () => {
          try {
            const layout = resolveImageOutputLayout(
              { width: img.width, height: img.height },
              {
                method: dimensionMethod,
                limitPixels: limitDimensions,
                customWidth,
                customHeight,
                customResizeMode
              }
            )

            let selectedOutputFormat: string
            if (convertFormat === 'default') {
              selectedOutputFormat = file.type
              if (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedOutputFormat)) {
                selectedOutputFormat = 'image/png'
              }
            } else {
              selectedOutputFormat = convertFormat
            }

            const isIcoOutput = selectedOutputFormat === 'image/vnd.microsoft.icon'
            const canvasOutputFormat = isIcoOutput ? 'image/png' : selectedOutputFormat
            const finalOutputFormat = isIcoOutput ? 'image/vnd.microsoft.icon' : canvasOutputFormat
            const initialQuality = quality / 100
            const targetBytes = compressMethod === 'limitWeight'
              ? getTargetWeightBytes(limitWeight, limitWeightUnit)
              : null
            const initialCanvasSize = isIcoOutput
              ? resolveIcoCanvasSize(layout.canvasWidth, layout.canvasHeight)
              : { width: layout.canvasWidth, height: layout.canvasHeight }
            let finalWidth = initialCanvasSize.width
            let finalHeight = initialCanvasSize.height
            let blob: Blob | null = null

            for (let attempt = 0; attempt < (targetBytes ? TARGET_RESIZE_ATTEMPTS : 1); attempt++) {
              const canvas = drawImageToCanvas(img, layout, canvasOutputFormat, finalWidth, finalHeight)
              const encoded = isIcoOutput
                ? await encodeIcoCanvasOutput(canvas, finalWidth, finalHeight, targetBytes)
                : await encodeCanvasOutput(canvas, canvasOutputFormat, initialQuality, targetBytes)

              blob = encoded.blob

              if (!targetBytes || encoded.reachedTarget || finalWidth <= 1 || finalHeight <= 1) {
                break
              }

              const nextSize = getNextTargetCanvasSize(finalWidth, finalHeight, blob.size, targetBytes)
              if (nextSize.width === finalWidth && nextSize.height === finalHeight) {
                break
              }

              finalWidth = nextSize.width
              finalHeight = nextSize.height
            }

            if (!blob) {
              reject(new Error('压缩失败'))
              return
            }

            const thumbnailCanvas = document.createElement('canvas')
            const thumbnailCtx = thumbnailCanvas.getContext('2d')
            if (thumbnailCtx) {
              const thumbSize = 48
              const thumbAdjusted = getAdjustedDimensions(img, thumbSize)
              thumbnailCanvas.width = thumbAdjusted.width
              thumbnailCanvas.height = thumbAdjusted.height
              thumbnailCtx.drawImage(img, 0, 0, thumbAdjusted.width, thumbAdjusted.height)
            }

            const thumbnailBlob = await new Promise<Blob>((resolveThumb, rejectThumb) => {
              thumbnailCanvas.toBlob((b) => {
                if (b) {
                  resolveThumb(b)
                } else {
                  rejectThumb(new Error('Failed to create thumbnail blob'))
                }
              }, 'image/png', 0.8)
            })

            const outputUrl = URL.createObjectURL(blob)
            const thumbnailUrl = URL.createObjectURL(thumbnailBlob)
            const outputExt = getFileExtension(finalOutputFormat)
            const outputFileName = updateFileExtension(file.name, outputExt, finalOutputFormat)

            resolve({
              id: Math.random().toString(36).substring(2, 10),
              originalFile: file,
              processedBlob: blob,
              thumbnailUrl,
              outputUrl,
              fileName: outputFileName,
              width: finalWidth,
              height: finalHeight,
              originalSize: file.size,
              processedSize: blob.size
            })
          } catch (err) {
            reject(err)
          }
        }
        img.onerror = () => reject(new Error('无法加载图片'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('无法读取文件'))
      reader.readAsDataURL(file)
    })
  }, [
    quality,
    compressMethod,
    limitWeight,
    limitWeightUnit,
    dimensionMethod,
    limitDimensions,
    customWidth,
    customHeight,
    customResizeMode,
    convertFormat
  ])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setIsProcessing(true)
    setProcessingProgress(0)
    setCurrentSubpage('output')

    const newProcessedImages: ProcessedImage[] = []
    let processedCount = 0

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i]
      setProcessingText(`处理中 "${file.name}"`)
      try {
        const result = await compressImage(file)
        if (result) {
          newProcessedImages.push(result)
        }
      } catch (err) {
        console.error('处理图片失败:', err)
      }
      processedCount++
      setProcessingProgress(Math.round((processedCount / fileArray.length) * 100))
    }

    setProcessedImages(prev => [...newProcessedImages, ...prev])
    setIsProcessing(false)
    setProcessingText('完成！')
  }, [compressImage])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (isProcessing) return
    const files = e.dataTransfer.files
    handleFiles(files)
  }, [handleFiles, isProcessing])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }, [handleFiles])

  const handleDeleteImage = useCallback((id: string) => {
    setProcessedImages(prev => {
      const image = prev.find(img => img.id === id)
      if (image) {
        URL.revokeObjectURL(image.outputUrl)
        URL.revokeObjectURL(image.thumbnailUrl)
      }
      return prev.filter(img => img.id !== id)
    })
  }, [])

  const handleDownloadImage = useCallback((image: ProcessedImage) => {
    const a = document.createElement('a')
    a.href = image.outputUrl
    a.download = image.fileName
    a.click()
  }, [])

  const handleDownloadAll = useCallback(async () => {
    if (processedImages.length === 0 || isPackaging) return

    setIsPackaging(true)
    setDownloadError('')

    try {
      const zipBlob = await createImageProcessorZip(
        processedImages.map((image) => ({
          fileName: image.fileName,
          blob: image.processedBlob
        }))
      )
      const zipUrl = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      const dateStamp = new Date().toISOString().slice(0, 10)
      a.href = zipUrl
      a.download = `onetool-images-${dateStamp}.zip`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(zipUrl), 1000)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : '打包下载失败')
    } finally {
      setIsPackaging(false)
    }
  }, [processedImages, isPackaging])

  const handleDeleteAll = useCallback(() => {
    processedImages.forEach(image => {
      URL.revokeObjectURL(image.outputUrl)
      URL.revokeObjectURL(image.thumbnailUrl)
    })
    setProcessedImages([])
  }, [processedImages])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const getSavedPercentage = (original: number, processed: number): string => {
    const saved = original - processed
    const percentage = Math.abs((saved / original) * 100).toFixed(1)
    const trend = saved < 0 ? '+' : saved > 0 ? '-' : ''
    return `${trend}${percentage}%`
  }

  const getSavedClass = (original: number, processed: number): string => {
    const saved = original - processed
    return saved <= 0 ? 'text-red-500 bg-red-50 dark:bg-red-950/30' : 'text-green-600 bg-green-50 dark:bg-green-950/30'
  }

  return (
    <div className="space-y-3">
      <div className="">
        <h2 className="text-lg font-semibold mb-0.5">图片处理</h2>
        <p className="text-xs text-muted-foreground italic">💡 请先在下方设置压缩参数，然后再拖入图片即可获得结果</p>
      </div>



      {isProcessing && (
        <Card className="animate-scale-in overflow-hidden">
          <CardContent className="p-3">
            <div className="text-center mb-2">
              <p className="text-sm font-medium">{processingText}</p>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-200 rounded-full relative overflow-hidden"
                style={{ width: `${processingProgress}%` }}
              >
                <div className="absolute inset-0 animate-shimmer" />
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-1">{processingProgress}%</p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
        <div className="inline-flex bg-muted/50 rounded-md p-0.5 gap-0.5">
          <button
            onClick={() => setCurrentSubpage('settings')}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-all duration-150 flex items-center gap-1.5",
              currentSubpage === 'settings'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            设置
          </button>
          <button
            onClick={() => setCurrentSubpage('output')}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-all duration-150 flex items-center gap-1.5",
              currentSubpage === 'output'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            图片
            {processedImages.length > 0 && (
              <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded-full text-[10px]">
                {processedImages.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {currentSubpage === 'settings' && (
        <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {!isProcessing && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative h-[160px] rounded-lg overflow-hidden cursor-pointer transition-all duration-200",
                "bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20",
                "border border-border/50",
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01] shadow-md shadow-primary/10"
                  : "hover:border-primary/30 hover:bg-primary/5"
              )}
            >
              <div className="relative w-full h-full flex items-center justify-center p-4">
                <div className="text-center flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 flex-shrink-0",
                    "bg-gradient-to-br from-primary/10 to-primary/5",
                    isDragging ? "scale-110 animate-float" : ""
                  )}>
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium mb-0.5">
                      {isDragging ? '松开即刻处理' : '拖放或点击增加图片'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">已选参数将自动应用</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".svg,.gif,.jpg,.jpeg,.png,.webp,.ico"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">优化方式</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'quality', label: '设置质量', desc: '数值越高细节越多' },
                  { value: 'limitWeight', label: '限制大小', desc: '压缩至目标大小' }
                ].map((method) => (
                  <button
                    key={method.value}
                    onClick={() => setCompressMethod(method.value as CompressMethod)}
                    className={cn(
                      "p-3 rounded-lg border transition-all duration-150 text-left",
                      compressMethod === method.value
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">{method.label}</span>
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                        compressMethod === method.value ? "border-primary" : "border-muted-foreground/50"
                      )}>
                        {compressMethod === method.value && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{method.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {compressMethod === 'quality' && (
            <Card className="animate-scale-in">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">质量设置</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex items-center gap-3">
                  <div className="relative w-20">
                    <Input
                      type="number"
                      value={quality}
                      onChange={(e) => setQuality(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                      min={0}
                      max={100}
                      className="pr-8 h-8 text-xs text-center"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                  </div>
                  <div className="flex-1 relative h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-purple-500 rounded-full transition-all duration-150"
                      style={{ width: `${quality}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={quality}
                      onChange={(e) => setQuality(parseInt(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {compressMethod === 'limitWeight' && (
            <Card className="animate-scale-in">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">目标文件大小</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      type="number"
                      value={limitWeight}
                      onChange={(e) => setLimitWeight(parseFloat(e.target.value) || 0)}
                      step={0.1}
                      className="pr-10 h-8 text-xs"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                      {limitWeightUnit}
                    </span>
                  </div>
                  <div className="flex-1">
                    <select
                      value={limitWeightUnit}
                      onChange={(e) => setLimitWeightUnit(e.target.value as 'MB' | 'KB')}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="MB">MB</option>
                      <option value="KB">KB</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">尺寸设置</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'original', label: '原始尺寸', desc: '不修改宽高' },
                  { value: 'limit', label: '限制尺寸', desc: '限制最大宽高' },
                  { value: 'custom', label: '自定义尺寸', desc: '指定宽高' }
                ].map((method) => (
                  <button
                    key={method.value}
                    onClick={() => setDimensionMethod(method.value as ImageDimensionMethod)}
                    className={cn(
                      "p-3 rounded-lg border transition-all duration-150 text-left",
                      dimensionMethod === method.value
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">{method.label}</span>
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                        dimensionMethod === method.value ? "border-primary" : "border-muted-foreground/50"
                      )}>
                        {dimensionMethod === method.value && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{method.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {dimensionMethod === 'limit' && (
            <Card className="animate-scale-in">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">限制尺寸</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="relative w-28">
                  <Input
                    type="number"
                    value={limitDimensions}
                    onChange={(e) => setLimitDimensions(Math.min(30000, Math.max(1, parseInt(e.target.value) || 1)))}
                    step={50}
                    className="pr-10 h-8 text-xs"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">px</span>
                </div>
              </CardContent>
            </Card>
          )}

          {dimensionMethod === 'custom' && (
            <Card className="animate-scale-in">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">自定义尺寸</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">宽度</span>
                    <div className="relative">
                      <Input
                        type="number"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(sanitizePixelInput(e.target.value))}
                        step={50}
                        min={1}
                        max={30000}
                        className="pr-10 h-8 text-xs"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">px</span>
                    </div>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">高度</span>
                    <div className="relative">
                      <Input
                        type="number"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(sanitizePixelInput(e.target.value))}
                        step={50}
                        min={1}
                        max={30000}
                        className="pr-10 h-8 text-xs"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">px</span>
                    </div>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'fit', label: '等比适配', desc: '居中留白' },
                    { value: 'crop', label: '等比裁切', desc: '裁掉多余' },
                    { value: 'stretch', label: '强制拉伸', desc: '铺满画布' }
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setCustomResizeMode(mode.value as CustomResizeMode)}
                      className={cn(
                        "p-2.5 rounded-lg border transition-all duration-150 text-left",
                        customResizeMode === mode.value
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{mode.label}</span>
                        <div className={cn(
                          "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors",
                          customResizeMode === mode.value ? "border-primary" : "border-muted-foreground/50"
                        )}>
                          {customResizeMode === mode.value && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{mode.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">输出格式</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'default', label: '默认', desc: '原格式' },
                  { value: 'image/jpeg', label: 'JPG', desc: '体积小' },
                  { value: 'image/png', label: 'PNG', desc: '透明' },
                  { value: 'image/webp', label: 'WebP', desc: '高压缩' },
                  { value: 'image/vnd.microsoft.icon', label: 'ICO', desc: '图标' },
                ].map((format) => (
                  <button
                    key={format.value}
                    onClick={() => setConvertFormat(format.value as ConvertFormat)}
                    className={cn(
                      "p-2.5 rounded-lg border transition-all duration-150 text-left",
                      convertFormat === format.value
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{format.label}</span>
                      <div className={cn(
                        "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors",
                        convertFormat === format.value ? "border-primary" : "border-muted-foreground/50"
                      )}>
                        {convertFormat === format.value && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{format.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {currentSubpage === 'output' && (
        <Card className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">处理结果</CardTitle>
              </div>
              {processedImages.length > 0 && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={handleDeleteAll} className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    清空
                  </Button>
                  <Button size="sm" onClick={() => void handleDownloadAll()} disabled={isPackaging} className="h-6 px-2 text-xs gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {isPackaging ? '打包中' : '打包下载'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {downloadError && (
              <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-600 dark:bg-red-950/30 dark:text-red-300">
                {downloadError}
              </p>
            )}
            {processedImages.length === 0 ? (
              <div className="text-center py-6 animate-scale-in">
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-muted flex items-center justify-center">
                  <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground">暂无处理结果</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {processedImages.map((image, index) => (
                  <div
                    key={image.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors animate-slide-in-right"
                    style={{ animationDelay: `${index * 0.03}s` }}
                  >
                    <img
                      src={image.thumbnailUrl}
                      alt={image.fileName}
                      className="w-10 h-10 object-cover rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{image.fileName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{image.width}x{image.height}</span>
                        <span className="text-[11px]">{formatFileSize(image.processedSize)}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", getSavedClass(image.originalSize, image.processedSize))}>
                          {getSavedPercentage(image.originalSize, image.processedSize)}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                          {getFileExtension(image.processedBlob.type).toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteImage(image.id)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </Button>
                      <a
                        href={image.outputUrl}
                        download={image.fileName}
                        className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-6 w-6"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {processedImages.length > 0 && !isProcessing && (
        <div className="text-center animate-fade-in-up">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentSubpage('settings')
            }}
            className="gap-1.5 h-7 text-xs"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            继续添加
          </Button>
        </div>
      )}
    </div>
  )
}

export default ImageProcessorTool
