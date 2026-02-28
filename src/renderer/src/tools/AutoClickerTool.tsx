import React, { useState, useCallback, useEffect } from 'react'
import { MousePointer, Play, Square, Settings, Info, Keyboard, AlertCircle, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { useAutoClicker } from '../hooks/useAutoClicker'

const styles = `
  @keyframes merit-float {
    0% { opacity: 0; transform: translateY(0) scale(0.8); }
    20% { opacity: 1; transform: translateY(-20px) scale(1.1); }
    100% { opacity: 0; transform: translateY(-120px) scale(1.5); }
  }

  @keyframes ripple {
    0% { transform: scale(0.8); opacity: 0.5; }
    100% { transform: scale(2.5); opacity: 0; }
  }

  @keyframes border-flow {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }

  .glass-card {
    background: var(--glass-bg);
    backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid var(--glass-border);
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.1);
    transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  }

  .dark .glass-card {
    --glass-bg: rgba(23, 23, 23, 0.6);
    --glass-border: rgba(255, 255, 255, 0.08);
  }

  .light .glass-card {
    --glass-bg: rgba(255, 255, 255, 0.7);
    --glass-border: rgba(0, 0, 0, 0.05);
  }

  .merit-text {
    position: absolute;
    pointer-events: none;
    animation: merit-float 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    font-weight: 900;
    background: linear-gradient(to bottom, #a855f7, #6366f1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 4px 8px rgba(168, 85, 247, 0.3));
  }

  .ripple-effect {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%);
    width: 100px;
    height: 100px;
    margin-left: -50px;
    margin-top: -50px;
    pointer-events: none;
    animation: ripple 0.8s ease-out forwards;
  }

  .running-glow {
    position: relative;
  }
  
  .running-glow::after {
    content: '';
    position: absolute;
    inset: -3px;
    background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
    background-size: 200% 100%;
    animation: border-flow 3s linear infinite;
    border-radius: inherit;
    z-index: -1;
    opacity: 0.6;
    filter: blur(12px);
  }

  /* 极简滑块样式 */
  .custom-slider {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    background: rgba(168, 85, 247, 0.1);
    border-radius: 10px;
    outline: none;
  }
  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    background: #a855f7;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
    transition: all 0.2s;
  }
  .custom-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 15px rgba(168, 85, 247, 0.6);
  }
`

interface Merit {
  id: number
  x: number
  y: number
  text: string
}

export const AutoClickerTool: React.FC = () => {
  const {
    isRunning,
    clickInterval, setClickInterval,
    button, setButton,
    shortcut, setShortcut,
    isListeningShortcut, setIsListeningShortcut,
    startAutoClicker,
    stopAutoClicker,
    updateConfig
  } = useAutoClicker()

  const [merits, setMerits] = useState<Merit[]>([])
  const [ripples, setRipples] = useState<{ id: number, x: number, y: number }[]>([])
  const [meritCount, setMeritCount] = useState(0)

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    return () => { document.head.removeChild(styleSheet) }
  }, [])

  const handleToggle = async () => {
    if (isRunning) await stopAutoClicker()
    else await startAutoClicker()
  }

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    if (!isListeningShortcut) return
    e.preventDefault()
    e.stopPropagation()
    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('CommandOrControl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    let key = e.key.toUpperCase()
    if (['CONTROL', 'ALT', 'SHIFT', 'META'].includes(key)) return
    if (key === ' ') key = 'Space'
    const fullShortcut = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key
    setShortcut(fullShortcut.replace('CommandOrControl+', 'Ctrl+'))
    setIsListeningShortcut(false)
    await updateConfig({ shortcut: fullShortcut })
  }, [isListeningShortcut, updateConfig, setShortcut, setIsListeningShortcut])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const spawnMerit = (e: React.MouseEvent) => {
    const id = Date.now()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const texts = ["功德+1", "烦恼-1", "福报+1", "暴击+1"]
    setMerits(prev => [...prev, { id, x, y, text: texts[Math.floor(Math.random() * texts.length)] }])
    setRipples(prev => [...prev, { id, x, y }])
    setMeritCount(c => c + 1)
    setTimeout(() => {
      setMerits(prev => prev.filter(m => m.id !== id))
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 1200)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in p-4 pb-20">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
          极速连点器
        </h1>
        <p className="text-muted-foreground text-sm font-medium">释放双手，专注于更重要的事情</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <Card className="glass-card overflow-hidden border-none rounded-3xl">
            <CardContent className="p-8 space-y-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-500/10 rounded-2xl">
                      <Settings className="w-5 h-5 text-purple-500" />
                    </div>
                    <Label className="text-base font-bold">连点间隔</Label>
                  </div>
                  <span className="font-mono font-bold text-lg text-purple-500 bg-purple-500/10 px-3 py-1 rounded-lg">
                    {clickInterval}ms
                  </span>
                </div>

                <div className="px-2">
                  <input
                    type="range"
                    min="10"
                    max="2000"
                    step="10"
                    value={clickInterval}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setClickInterval(val)
                      updateConfig({ interval: val })
                    }}
                    className="custom-slider"
                  />
                  <div className="flex justify-between mt-3 text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                    <span>极速 (10ms)</span>
                    <span>平稳 (2000ms)</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />

              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-2xl">
                    <MousePointer className="w-5 h-5 text-indigo-500" />
                  </div>
                  <Label className="text-base font-bold">点击按键</Label>
                </div>

                <RadioGroup
                  value={button}
                  onValueChange={(val: any) => {
                    setButton(val)
                    updateConfig({ button: val })
                  }}
                  className="grid grid-cols-3 gap-4"
                >
                  {['left', 'right', 'middle'].map((b) => (
                    <div key={b}>
                      <RadioGroupItem value={b} id={b} className="sr-only" />
                      <Label
                        htmlFor={b}
                        className={cn(
                          "flex flex-col items-center justify-center p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300",
                          button === b
                            ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-[1.02]"
                            : "border-muted-foreground/10 hover:border-indigo-500/30 bg-muted/30"
                        )}
                      >
                        <span className="text-xs font-black uppercase tracking-wider">{b === 'left' ? '左键' : b === 'right' ? '右键' : '中键'}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-none rounded-3xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-blue-500/10 rounded-2xl">
                <Info className="w-5 h-5 text-blue-500" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold">使用技巧</h4>
                <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed font-medium">
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-blue-500" />
                    设置较小间隔时，请确保目标程序能响应高频点击
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-blue-500" />
                    随时按 <kbd className="px-1.5 py-0.5 bg-muted rounded border-b-2 border-muted-foreground/30 font-mono font-black text-[10px]">F8</kbd> 触发紧急停止
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-6">
          {/* 启动/停止控制区 */}
          <button
            onClick={handleToggle}
            className={cn(
              "w-full py-10 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 transition-all duration-500 relative group overflow-hidden border-4",
              isRunning
                ? "bg-gradient-to-br from-indigo-600 to-purple-600 border-indigo-400 running-glow"
                : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-purple-500/30 shadow-xl"
            )}
          >
            <div className={cn(
              "w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-500",
              isRunning ? "bg-white/20 rotate-180 shadow-inner" : "bg-purple-500/10 shadow-sm"
            )}>
              {isRunning ? (
                <Square className="w-8 h-8 text-white fill-white" />
              ) : (
                <Play className="w-8 h-8 text-purple-500 fill-purple-500" />
              )}
            </div>

            <div className="space-y-1 text-center">
              <div className={cn("text-xl font-black transition-colors duration-500", isRunning ? "text-white" : "text-foreground")}>
                {isRunning ? "连点引擎运行中" : "启动连点引擎"}
              </div>
              <div className={cn("text-xs font-bold opacity-60", isRunning ? "text-white" : "text-muted-foreground")}>
                {isRunning ? "点击按钮或按快捷键停止" : "点击按钮或按快捷键启动"}
              </div>
            </div>

            {isRunning && (
              <div className="absolute top-6 right-6 flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}
          </button>

          {/* 模拟测试区 */}
          <Card
            className="glass-card border-none rounded-3xl overflow-hidden cursor-pointer relative h-[240px] group active:scale-[0.98] transition-all duration-150"
            onClick={spawnMerit}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center select-none">
              {ripples.map(r => (
                <div key={r.id} className="ripple-effect" style={{ left: r.x, top: r.y }} />
              ))}
              {merits.map(m => (
                <span key={m.id} className="merit-text" style={{ left: m.x, top: m.y }}>{m.text}</span>
              ))}

              <div className="p-4 bg-purple-500/10 rounded-2xl mb-3 group-hover:scale-110 transition-transform duration-300">
                <Zap className="w-8 h-8 text-purple-500 fill-purple-500" />
              </div>
              <h4 className="font-black text-sm mb-1 uppercase tracking-tight">点击此处进行测试</h4>
              <p className="text-[10px] text-muted-foreground font-bold opacity-60">
                累计点击: <span className="text-purple-500">{meritCount}</span> 次
              </p>
              <div className="mt-4 px-3 py-1 bg-muted/50 rounded-full border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">测试点击反馈及速度</span>
              </div>
            </div>
          </Card>

          {/* 快捷键设置区 */}
          <Card className="glass-card border-none rounded-3xl p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-bold tracking-tight">快捷键绑定</span>
                </div>
                {isRunning && (
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-500 bg-green-500/10 px-2 py-0.5 rounded-full uppercase">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    已激活
                  </div>
                )}
              </div>

              <div className="relative group">
                <div
                  onClick={() => setIsListeningShortcut(true)}
                  className={cn(
                    "w-full h-14 rounded-2xl flex items-center justify-center font-mono font-black text-lg transition-all duration-300 cursor-pointer border-2",
                    isListeningShortcut
                      ? "bg-purple-500/10 border-purple-500 text-purple-500 scale-[1.02] shadow-lg shadow-purple-500/10"
                      : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {isListeningShortcut ? "等待键盘录入..." : shortcut}
                </div>
                {isListeningShortcut && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center text-white animate-bounce shadow-lg">
                    <Zap className="w-3 h-3 fill-white" />
                  </div>
                )}
              </div>

              <p className="text-[10px] font-bold text-muted-foreground/60 text-center uppercase tracking-widest">
                {isListeningShortcut ? "按下组合键完成设置" : "点击上方框块修改快捷键"}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AutoClickerTool
