import React, { useState, useRef, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'

interface QRCodeOptions {
  width: number
  height: number
  margin: number
  colorDark: string
  colorLight: string
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
}

interface LogoOptions {
  enabled: boolean
  image: string | null
  width: number
  height: number
  borderRadius: number
  borderWidth: number
  borderColor: string
}

const styles = `
  @keyframes fade-in {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  @keyframes fade-in-up {
    0% { opacity: 0; transform: translateY(0.5rem); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes fade-in-scale {
    0% { opacity: 0; transform: scale(0.95); }
    100% { opacity: 1; transform: scale(1); }
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(187, 134, 252, 0.3); }
    50% { box-shadow: 0 0 40px rgba(187, 134, 252, 0.6); }
  }

  @keyframes slide-in-right {
    0% { transform: translateX(100%); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
  }

  .animate-fade-in {
    animation: fade-in 0.3s ease-out forwards;
  }

  .animate-fade-in-up {
    animation: fade-in-up 0.4s ease-out forwards;
  }

  .animate-fade-in-scale {
    animation: fade-in-scale 0.5s ease-out forwards;
  }

  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }

  .animate-slide-in-right {
    animation: slide-in-right 0.3s ease-out forwards;
  }

  .color-picker-wrapper {
    position: relative;
    overflow: hidden;
  }

  .color-picker-wrapper input[type="color"] {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    cursor: pointer;
    opacity: 0;
  }
`

export const QRCodeTool: React.FC = () => {
  const [text, setText] = useState('https://example.com')
  const [qrOptions, setQrOptions] = useState<QRCodeOptions>({
    width: 400,
    height: 400,
    margin: 20,
    colorDark: '#000000',
    colorLight: '#ffffff',
    errorCorrectionLevel: 'M'
  })
  const [logoOptions, setLogoOptions] = useState<LogoOptions>({
    enabled: false,
    image: null,
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ffffff'
  })
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'logo'>('content')
  const [generatedQR, setGeneratedQR] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  useEffect(() => {
    generateQRCode()
  }, [text, qrOptions, logoOptions])

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const generateQRCode = useCallback(async () => {
    if (!text.trim()) {
      setGeneratedQR(null)
      return
    }

    setIsGenerating(true)
    try {
      const canvas = canvasRef.current
      if (!canvas) return

      await QRCode.toCanvas(canvas, text, {
        width: qrOptions.width,
        margin: qrOptions.margin,
        color: {
          dark: qrOptions.colorDark,
          light: qrOptions.colorLight
        },
        errorCorrectionLevel: qrOptions.errorCorrectionLevel
      })

      if (logoOptions.enabled && logoOptions.image) {
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const logoX = (canvas.width - logoOptions.width) / 2
          const logoY = (canvas.height - logoOptions.height) / 2

          if (logoOptions.borderWidth > 0) {
            ctx.fillStyle = logoOptions.borderColor
            ctx.beginPath()
            ctx.roundRect(
              logoX - logoOptions.borderWidth,
              logoY - logoOptions.borderWidth,
              logoOptions.width + logoOptions.borderWidth * 2,
              logoOptions.height + logoOptions.borderWidth * 2,
              logoOptions.borderRadius + logoOptions.borderWidth
            )
            ctx.fill()
          }

          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.roundRect(
            logoX,
            logoY,
            logoOptions.width,
            logoOptions.height,
            logoOptions.borderRadius
          )
          ctx.fill()

          ctx.save()
          ctx.beginPath()
          ctx.roundRect(
            logoX,
            logoY,
            logoOptions.width,
            logoOptions.height,
            logoOptions.borderRadius
          )
          ctx.clip()
          ctx.drawImage(img, logoX, logoY, logoOptions.width, logoOptions.height)
          ctx.restore()

          setGeneratedQR(canvas.toDataURL('image/png'))
          setIsGenerating(false)
        }
        img.onerror = () => {
          setGeneratedQR(canvas.toDataURL('image/png'))
          setIsGenerating(false)
        }
        img.src = logoOptions.image
      } else {
        setGeneratedQR(canvas.toDataURL('image/png'))
        setIsGenerating(false)
      }
    } catch (error) {
      console.error('QR Code generation error:', error)
      showToast('生成二维码失败', 'error')
      setIsGenerating(false)
    }
  }, [text, qrOptions, logoOptions, showToast])

  const handleDownload = useCallback(() => {
    if (!generatedQR) return

    const link = document.createElement('a')
    link.href = generatedQR
    link.download = `qrcode-${Date.now()}.png`
    link.click()
    showToast('二维码已下载')
  }, [generatedQR, showToast])

  const handleCopy = useCallback(async () => {
    if (!generatedQR) return

    try {
      const response = await fetch(generatedQR)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      showToast('二维码已复制到剪贴板')
    } catch (error) {
      showToast('复制失败', 'error')
    }
  }, [generatedQR, showToast])

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('请上传图片文件', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const maxSize = 80
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
        setLogoOptions(prev => ({
          ...prev,
          enabled: true,
          image: event.target?.result as string,
          width: Math.round(img.width * ratio),
          height: Math.round(img.height * ratio)
        }))
        showToast('Logo 上传成功')
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [showToast])

  const handleRemoveLogo = useCallback(() => {
    setLogoOptions(prev => ({ ...prev, enabled: false, image: null }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const presetTexts = [
    { label: '网址', value: 'https://example.com', icon: '🔗' },
    { label: 'WiFi', value: 'WIFI:T:WPA;S:MyNetwork;P:password;;', icon: '📶' },
    { label: '邮箱', value: 'mailto:example@email.com', icon: '📧' },
    { label: '电话', value: 'tel:+8612345678900', icon: '📱' },
    { label: '短信', value: 'sms:+8612345678900?body=Hello', icon: '💬' },
    { label: '纯文本', value: 'Hello World', icon: '📝' }
  ]

  const errorLevels = [
    { value: 'L', label: '低 (~7%)', desc: '最低纠错，可存储更多数据' },
    { value: 'M', label: '中 (~15%)', desc: '默认级别，平衡纠错和数据量' },
    { value: 'Q', label: '高 (~25%)', desc: '较高纠错能力' },
    { value: 'H', label: '最高 (~30%)', desc: '最高纠错，适合添加 Logo' }
  ]

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500/5 dark:bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            二维码生成器
          </h1>
          <p className="text-muted-foreground">创建自定义二维码，支持添加 Logo 和样式调整</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex bg-white/50 dark:bg-white/10 backdrop-blur-sm rounded-xl p-1 gap-1">
              {[
                { id: 'content', label: '内容', icon: '📝' },
                { id: 'style', label: '样式', icon: '🎨' },
                { id: 'logo', label: 'Logo', icon: '🖼️' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === tab.id
                      ? 'bg-white/70 dark:bg-white/20 text-foreground shadow-soft-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/30 dark:hover:bg-white/5'
                    }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'content' && (
              <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft animate-fade-in">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>📝</span> 二维码内容
                </h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">快速选择</label>
                  <div className="flex flex-wrap gap-2">
                    {presetTexts.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => setText(preset.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${text === preset.value
                            ? 'bg-purple-500/30 text-purple-400 dark:text-purple-300 border border-purple-500/50'
                            : 'bg-white/30 dark:bg-white/5 text-muted-foreground border border-white/20 dark:border-white/10 hover:border-purple-500/30'
                          }`}
                      >
                        {preset.icon} {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">内容</label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="输入网址、文本或其他内容..."
                    className="w-full h-32 bg-white/50 dark:bg-white/10 border border-white/20 dark:border-white/10 rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-purple-500 transition-colors duration-200"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    当前字符数: {text.length}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-3">纠错级别</label>
                  <div className="space-y-2">
                    {errorLevels.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setQrOptions(prev => ({ ...prev, errorCorrectionLevel: level.value as typeof qrOptions.errorCorrectionLevel }))}
                        className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left ${qrOptions.errorCorrectionLevel === level.value
                            ? 'border-purple-500/50 bg-purple-500/10'
                            : 'border-white/20 dark:border-white/10 hover:border-purple-500/30 bg-white/30 dark:bg-white/5'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{level.label}</span>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${qrOptions.errorCorrectionLevel === level.value ? 'border-purple-400' : 'border-muted-foreground'
                            }`}>
                            {qrOptions.errorCorrectionLevel === level.value && (
                              <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{level.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'style' && (
              <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft animate-fade-in">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>🎨</span> 样式设置
                </h2>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-muted-foreground mb-3">二维码尺寸</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="200"
                      max="800"
                      step="50"
                      value={qrOptions.width}
                      onChange={(e) => {
                        const size = parseInt(e.target.value)
                        setQrOptions(prev => ({ ...prev, width: size, height: size }))
                      }}
                      className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <span className="text-sm text-muted-foreground w-16 text-right">{qrOptions.width}px</span>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-muted-foreground mb-3">边距</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="5"
                      value={qrOptions.margin}
                      onChange={(e) => setQrOptions(prev => ({ ...prev, margin: parseInt(e.target.value) }))}
                      className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <span className="text-sm text-muted-foreground w-16 text-right">{qrOptions.margin}px</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">前景色</label>
                    <div className="color-picker-wrapper flex items-center gap-3 p-3 bg-white/30 dark:bg-white/5 rounded-xl border border-white/20 dark:border-white/10">
                      <div
                        className="w-10 h-10 rounded-lg border-2 border-white/30"
                        style={{ backgroundColor: qrOptions.colorDark }}
                      />
                      <input
                        type="color"
                        value={qrOptions.colorDark}
                        onChange={(e) => setQrOptions(prev => ({ ...prev, colorDark: e.target.value }))}
                      />
                      <span className="text-sm text-muted-foreground font-mono">{qrOptions.colorDark}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">背景色</label>
                    <div className="color-picker-wrapper flex items-center gap-3 p-3 bg-white/30 dark:bg-white/5 rounded-xl border border-white/20 dark:border-white/10">
                      <div
                        className="w-10 h-10 rounded-lg border-2 border-white/30"
                        style={{ backgroundColor: qrOptions.colorLight }}
                      />
                      <input
                        type="color"
                        value={qrOptions.colorLight}
                        onChange={(e) => setQrOptions(prev => ({ ...prev, colorLight: e.target.value }))}
                      />
                      <span className="text-sm text-muted-foreground font-mono">{qrOptions.colorLight}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-muted-foreground mb-2">快速预设</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { dark: '#000000', light: '#ffffff', label: '经典黑白' },
                      { dark: '#6d2eb8', light: '#ffffff', label: '紫色' },
                      { dark: '#e91e63', light: '#ffffff', label: '粉色' },
                      { dark: '#2196f3', light: '#ffffff', label: '蓝色' },
                      { dark: '#4caf50', light: '#ffffff', label: '绿色' },
                      { dark: '#ff5722', light: '#ffffff', label: '橙色' },
                      { dark: '#ffffff', light: '#000000', label: '反色' }
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => setQrOptions(prev => ({ ...prev, colorDark: preset.dark, colorLight: preset.light }))}
                        className="px-3 py-1.5 rounded-lg text-sm bg-white/30 dark:bg-white/5 border border-white/20 dark:border-white/10 hover:border-purple-500/30 transition-all duration-200 flex items-center gap-2"
                      >
                        <div className="flex">
                          <div className="w-3 h-3 rounded-l-sm" style={{ backgroundColor: preset.dark }} />
                          <div className="w-3 h-3 rounded-r-sm" style={{ backgroundColor: preset.light }} />
                        </div>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'logo' && (
              <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft animate-fade-in">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <span>🖼️</span> Logo 设置
                </h2>

                <div className="mb-6">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-12 h-6 rounded-full transition-colors duration-200 ${logoOptions.enabled ? 'bg-purple-500' : 'bg-muted'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 mt-0.5 ${logoOptions.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </div>
                    <input
                      type="checkbox"
                      checked={logoOptions.enabled}
                      onChange={(e) => setLogoOptions(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="hidden"
                    />
                    <span className="font-medium">在二维码中央显示 Logo</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-2">
                    提示：使用 Logo 时建议选择较高的纠错级别（Q 或 H）
                  </p>
                </div>

                {logoOptions.enabled && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Logo 图片</label>
                      {logoOptions.image ? (
                        <div className="flex items-center gap-4 p-3 bg-white/30 dark:bg-white/5 rounded-xl border border-white/20 dark:border-white/10">
                          <img
                            src={logoOptions.image}
                            alt="Logo"
                            className="w-16 h-16 object-contain rounded-lg bg-white/5"
                          />
                          <div className="flex-1">
                            <p className="text-sm">Logo 已上传</p>
                            <p className="text-xs text-muted-foreground">{logoOptions.width} x {logoOptions.height} px</p>
                          </div>
                          <button
                            onClick={handleRemoveLogo}
                            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors duration-200"
                          >
                            移除
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="p-8 border-2 border-dashed border-white/20 dark:border-white/10 rounded-xl text-center cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all duration-200"
                        >
                          <svg className="w-10 h-10 mx-auto mb-2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm text-muted-foreground">点击上传 Logo 图片</p>
                          <p className="text-xs text-muted-foreground mt-1">支持 PNG, JPG, SVG 格式</p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </div>

                    {logoOptions.image && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">Logo 宽度</label>
                          <div className="flex items-center gap-4">
                            <input
                              type="range"
                              min="30"
                              max="120"
                              step="5"
                              value={logoOptions.width}
                              onChange={(e) => setLogoOptions(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <span className="text-sm text-muted-foreground w-16 text-right">{logoOptions.width}px</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">圆角</label>
                          <div className="flex items-center gap-4">
                            <input
                              type="range"
                              min="0"
                              max="30"
                              step="2"
                              value={logoOptions.borderRadius}
                              onChange={(e) => setLogoOptions(prev => ({ ...prev, borderRadius: parseInt(e.target.value) }))}
                              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <span className="text-sm text-muted-foreground w-16 text-right">{logoOptions.borderRadius}px</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">边框宽度</label>
                          <div className="flex items-center gap-4">
                            <input
                              type="range"
                              min="0"
                              max="10"
                              step="1"
                              value={logoOptions.borderWidth}
                              onChange={(e) => setLogoOptions(prev => ({ ...prev, borderWidth: parseInt(e.target.value) }))}
                              className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <span className="text-sm text-muted-foreground w-16 text-right">{logoOptions.borderWidth}px</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-2">边框颜色</label>
                          <div className="color-picker-wrapper flex items-center gap-3 p-3 bg-white/30 dark:bg-white/5 rounded-xl border border-white/20 dark:border-white/10">
                            <div
                              className="w-10 h-10 rounded-lg border-2 border-white/30"
                              style={{ backgroundColor: logoOptions.borderColor }}
                            />
                            <input
                              type="color"
                              value={logoOptions.borderColor}
                              onChange={(e) => setLogoOptions(prev => ({ ...prev, borderColor: e.target.value }))}
                            />
                            <span className="text-sm text-muted-foreground font-mono">{logoOptions.borderColor}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="bg-card rounded-xl p-6 border border-white/20 dark:border-white/10 shadow-soft sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span>👁️</span> 预览
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    disabled={!generatedQR || isGenerating}
                    className="px-3 py-1.5 bg-white/30 dark:bg-white/5 hover:bg-white/50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    复制
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!generatedQR || isGenerating}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-1.5 text-white"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    下载
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center p-8 bg-white/30 dark:bg-white/5 rounded-xl border border-white/20 dark:border-white/10 min-h-[400px]">
                {isGenerating ? (
                  <div className="text-center text-muted-foreground">
                    <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
                    <p>生成中...</p>
                  </div>
                ) : generatedQR ? (
                  <div className="animate-fade-in-scale">
                    <img
                      src={generatedQR}
                      alt="QR Code"
                      className="max-w-full h-auto rounded-lg shadow-2xl"
                      style={{ maxHeight: '350px' }}
                    />
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM6 20h2v-4H6v4zm6-6h2v-4h-2v4zm-6 0h2v-4H6v4zm12-6h2V4h-2v4zM6 10h2V4H6v6zm6-6h2V4h-2v4z" />
                    </svg>
                    <p>请输入内容生成二维码</p>
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} className="hidden" />

              {generatedQR && (
                <div className="mt-4 p-3 bg-white/30 dark:bg-white/5 rounded-xl border border-white/20 dark:border-white/10">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">尺寸</span>
                    <span>{qrOptions.width} x {qrOptions.height} px</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-muted-foreground">纠错级别</span>
                    <span>{qrOptions.errorCorrectionLevel}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-muted-foreground">Logo</span>
                    <span>{logoOptions.enabled && logoOptions.image ? '已启用' : '未启用'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg animate-slide-in-right z-50 ${toast.type === 'success' ? 'bg-green-500/90' : 'bg-red-500/90'
          }`}>
          <div className="flex items-center gap-2 text-white">
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default QRCodeTool
