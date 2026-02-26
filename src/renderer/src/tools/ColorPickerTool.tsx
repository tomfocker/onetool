import React, { useState, useEffect, useCallback } from 'react'

interface ColorInfo {
  hex: string
  rgb: { r: number; g: number; b: number }
  hsl: { h: number; s: number; l: number }
}

interface ColorHistoryItem {
  hex: string
  timestamp: number
}

const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  }
}

const parseHexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

const getContrastColor = (hex: string): string => {
  const rgb = parseHexToRgb(hex)
  if (!rgb) return '#ffffff'
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
  return brightness > 128 ? '#000000' : '#ffffff'
}

export const ColorPickerTool: React.FC = () => {
  const [currentColor, setCurrentColor] = useState<ColorInfo>({
    hex: '#808080',
    rgb: { r: 128, g: 128, b: 128 },
    hsl: { h: 0, s: 0, l: 50 }
  })
  const [colorHistory, setColorHistory] = useState<ColorHistoryItem[]>([])
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const [manualHexInput, setManualHexInput] = useState('')
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    const savedHistory = localStorage.getItem('colorPickerHistory')
    if (savedHistory) {
      try {
        setColorHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to parse color history:', e)
      }
    }

    if (!window.electron?.colorPicker) return

    const unsubscribeSelected = window.electron.colorPicker.onSelected((data) => {
      updateColorFromData(data)
      saveToHistory(data.hex)
    })

    return () => {
      unsubscribeSelected()
    }
  }, [])

  const updateColorFromData = useCallback((data: { hex: string; r: number; g: number; b: number }) => {
    const hsl = rgbToHsl(data.r, data.g, data.b)
    setCurrentColor({
      hex: data.hex,
      rgb: { r: data.r, g: data.g, b: data.b },
      hsl
    })
  }, [])

  const saveToHistory = useCallback((hex: string) => {
    setColorHistory(prev => {
      const filtered = prev.filter(c => c.hex.toLowerCase() !== hex.toLowerCase())
      const newHistory = [{ hex, timestamp: Date.now() }, ...filtered].slice(0, 20)
      localStorage.setItem('colorPickerHistory', JSON.stringify(newHistory))
      return newHistory
    })
  }, [])

  const pickCurrentColor = useCallback(async () => {
    if (!window.electron?.colorPicker?.pick) {
      return
    }

    try {
      const result = await window.electron.colorPicker.pick()
      if (result.success && result.color) {
        updateColorFromData(result.color)
        saveToHistory(result.color.hex)
      }
    } catch (error) {
      console.error('Failed to pick color:', error)
    }
  }, [saveToHistory, updateColorFromData])

  const copyToClipboard = useCallback(async (text: string, format: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedFormat(format)
      setTimeout(() => setCopiedFormat(null), 1500)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }, [])

  const handleManualHexSubmit = useCallback(() => {
    let hex = manualHexInput.trim()
    if (!hex.startsWith('#')) {
      hex = '#' + hex
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      const rgb = parseHexToRgb(hex)
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
        setCurrentColor({ hex: hex.toLowerCase(), rgb, hsl })
        saveToHistory(hex)
        setManualHexInput('')
      }
    }
  }, [manualHexInput, saveToHistory])

  const handleHistoryClick = useCallback((hex: string) => {
    const rgb = parseHexToRgb(hex)
    if (rgb) {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
      setCurrentColor({ hex: hex.toLowerCase(), rgb, hsl })
    }
  }, [])

  const clearHistory = useCallback(() => {
    setColorHistory([])
    localStorage.removeItem('colorPickerHistory')
  }, [])

  const formatStrings = {
    hex: currentColor.hex.toUpperCase(),
    hexValue: currentColor.hex.replace('#', '').toUpperCase(),
    rgb: `rgb(${currentColor.rgb.r}, ${currentColor.rgb.g}, ${currentColor.rgb.b})`,
    rgbValue: `${currentColor.rgb.r}, ${currentColor.rgb.g}, ${currentColor.rgb.b}`,
    hsl: `hsl(${currentColor.hsl.h}, ${currentColor.hsl.s}%, ${currentColor.hsl.l}%)`
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            屏幕取色器
          </h1>
          <p className="text-muted-foreground">移动鼠标即可实时取色，点击"拾取颜色"保存到历史记录</p>
          <p className="text-sm text-muted-foreground mt-1">
            鼠标位置: X={mousePosition.x}, Y={mousePosition.y}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                当前颜色
              </h2>
              
              <div 
                className="relative w-full aspect-video rounded-xl mb-6 overflow-hidden transition-all duration-300"
                style={{ 
                  backgroundColor: currentColor.hex,
                  boxShadow: `0 0 60px ${currentColor.hex}40`
                }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:16px_16px]" />
                <div 
                  className="absolute bottom-4 left-4 px-4 py-2 rounded-lg font-mono text-lg font-bold backdrop-blur-sm"
                  style={{ 
                    backgroundColor: `${getContrastColor(currentColor.hex)}15`,
                    color: getContrastColor(currentColor.hex)
                  }}
                >
                  {currentColor.hex.toUpperCase()}
                </div>
              </div>

              <button
                onClick={pickCurrentColor}
                className="
                  w-full py-4 rounded-xl font-semibold text-lg transition-all duration-300
                  flex items-center justify-center gap-3
                  bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 hover:shadow-lg hover:shadow-purple-500/25 active:scale-[0.98]
                "
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>拾取颜色</span>
              </button>
            </div>

            <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                手动输入
              </h2>
              
              <div className="flex gap-3">
                <input
                  type="text"
                  value={manualHexInput}
                  onChange={(e) => setManualHexInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualHexSubmit()}
                  placeholder="#000000"
                  className="flex-1 bg-background border border-white/10 rounded-xl px-4 py-3 font-mono focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button
                  onClick={handleManualHexSubmit}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-medium transition-colors"
                >
                  应用
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                颜色格式
              </h2>
              
              <div className="space-y-2">
                {Object.entries(formatStrings).map(([format, value]) => (
                  <button
                    key={format}
                    onClick={() => copyToClipboard(value, format)}
                    className={`
                      w-full flex items-center justify-between p-3 rounded-xl
                      bg-background/50 hover:bg-background border border-white/5
                      transition-all duration-200 group
                      ${copiedFormat === format ? 'border-green-500/50 bg-green-500/10' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground uppercase text-xs font-medium w-16 text-left">
                        {format === 'hexValue' ? 'HEX值' : format === 'rgbValue' ? 'RGB值' : format.toUpperCase()}
                      </span>
                      <span className="font-mono text-sm">{value}</span>
                    </div>
                    <div className={`
                      transition-all duration-200
                      ${copiedFormat === format ? 'text-green-400' : 'text-muted-foreground group-hover:text-foreground'}
                    `}>
                      {copiedFormat === format ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  历史记录
                </h2>
                {colorHistory.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-sm text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    清空
                  </button>
                )}
              </div>
              
              {colorHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                  <p>暂无历史记录</p>
                  <p className="text-sm mt-1">点击"拾取颜色"后会自动保存在这里</p>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {colorHistory.map((item) => (
                    <button
                      key={item.timestamp}
                      onClick={() => handleHistoryClick(item.hex)}
                      className="aspect-square rounded-lg transition-transform hover:scale-110 hover:shadow-lg relative group"
                      style={{ backgroundColor: item.hex }}
                      title={item.hex.toUpperCase()}
                    >
                      <div className="absolute inset-0 rounded-lg border border-white/10 group-hover:border-white/30 transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-lg">
                        <span className="text-[10px] font-mono font-bold" style={{ color: getContrastColor(item.hex) }}>
                          {item.hex.toUpperCase()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 bg-card rounded-2xl p-6 border border-white/10 shadow-lg">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            使用说明
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-background/50 rounded-xl border border-white/5">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">1</span>
              </div>
              <h3 className="font-medium mb-1">移动鼠标</h3>
              <p className="text-sm text-muted-foreground">移动鼠标即可实时显示鼠标位置的颜色</p>
            </div>
            <div className="p-4 bg-background/50 rounded-xl border border-white/5">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">2</span>
              </div>
              <h3 className="font-medium mb-1">保存颜色</h3>
              <p className="text-sm text-muted-foreground">点击"拾取颜色"按钮保存当前颜色到历史记录</p>
            </div>
            <div className="p-4 bg-background/50 rounded-xl border border-white/5">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center mb-3">
                <span className="text-purple-400 font-bold">3</span>
              </div>
              <h3 className="font-medium mb-1">复制使用</h3>
              <p className="text-sm text-muted-foreground">点击颜色格式即可复制到剪贴板</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
