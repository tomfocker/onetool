import React, { useState, useCallback, useEffect } from 'react'
import { MousePointer, Play, Square, Settings, Info, Keyboard, AlertCircle, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

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
    box-shadow: 0 0 15px rgba(168, 85, 247, 0.5);
    transition: transform 0.2s;
  }
  .custom-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }
`

const WoodenFishSVG: React.FC<{ isShaking: boolean; isRunning: boolean }> = ({ isShaking, isRunning }) => (
  <svg 
    viewBox="0 0 200 200" 
    className={cn(
      "w-56 h-56 transition-all duration-300 cursor-pointer drop-shadow-2xl",
      isShaking && "scale-90 rotate-2",
      isRunning && "scale-105"
    )}
  >
    <defs>
      <filter id="glow-inner">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <linearGradient id="fishBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" className="text-slate-200" stopColor="currentColor" stopOpacity="0.1" />
        <stop offset="100%" className="text-slate-900" stopColor="currentColor" />
      </linearGradient>
    </defs>
    
    {/* 外部阴影层 */}
    <circle cx="100" cy="110" r="70" className="fill-black/10 blur-xl" />
    
    {/* 木鱼主体 */}
    <path
      d="M30,100 C30,40 170,40 170,100 C170,160 30,160 30,100"
      className="fill-slate-900 dark:fill-[#1a1a1a] transition-colors duration-500"
      stroke="#a855f7"
      strokeWidth="2.5"
      filter="url(#glow-inner)"
    />
    
    {/* 装饰线 */}
    <path
      d="M55,100 Q55,75 100,75 Q145,75 145,100 Q145,125 100,125 Q55,125 55,100"
      fill="none"
      stroke="rgba(168, 85, 247, 0.3)"
      strokeWidth="2"
      strokeDasharray="6 4"
      className={isRunning ? "animate-[spin_10s_linear_infinite] origin-center" : ""}
    />
    
    {/* 核心发光眼 */}
    <circle cx="100" cy="100" r="14" className="fill-purple-500/10" />
    <circle cx="100" cy="100" r="6" className={cn(
      "fill-purple-500 transition-all duration-300",
      isRunning ? "shadow-[0_0_20px_#a855f7] scale-125" : ""
    )} />
  </svg>
)

export const AutoClickerTool: React.FC = () => {
  const [clickInterval, setClickInterval] = useState(100)
  const [button, setButton] = useState<'left' | 'right' | 'middle'>('left')
  const [shortcut, setShortcut] = useState('F6')
  const [isRunning, setIsRunning] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [meritCount, setMeritCount] = useState(() => {
    const saved = localStorage.getItem('meritCount')
    return saved ? parseInt(saved) : 0
  })
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([])
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const [isShaking, setIsShaking] = useState(false)

  useEffect(() => {
    localStorage.setItem('meritCount', meritCount.toString())
  }, [meritCount])

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  useEffect(() => {
    const handleStarted = () => setIsRunning(true)
    const handleStopped = () => setIsRunning(false)
    
    if (window.electron.ipcRenderer) {
      const unsub1 = window.electron.ipcRenderer.on('autoclicker-started', handleStarted)
      const unsub2 = window.electron.ipcRenderer.on('autoclicker-stopped', handleStopped)
      return () => {
        if (typeof unsub1 === 'function') unsub1()
        if (typeof unsub2 === 'function') unsub2()
        window.electron.ipcRenderer.removeListener('autoclicker-started', handleStarted)
        window.electron.ipcRenderer.removeListener('autoclicker-stopped', handleStopped)
      }
    }
    return () => {}
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await window.electron.autoClicker.getStatus()
      setIsRunning(status.running)
      if (status.config) {
        setClickInterval(status.config.interval)
        setButton(status.config.button as any)
        setShortcut((status.config.shortcut || 'F6').replace('CommandOrControl+', 'Ctrl+'))
      }
    } catch (error) {
      console.error('Failed to get status:', error)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const handleWoodenFishClick = useCallback((e: React.MouseEvent) => {
    setMeritCount(prev => prev + 1)
    setIsShaking(true)
    setTimeout(() => setIsShaking(false), 150)
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const id = Date.now()
    setParticles(prev => [...prev, { id, x, y }])
    setRipples(prev => [...prev, { id, x, y }])
    
    setTimeout(() => {
      setParticles(prev => prev.filter(p => p.id !== id))
    }, 1200)
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 800)
  }, [])

  const handleStart = () => window.electron.autoClicker.start({ interval: clickInterval, button })
  const handleStop = () => window.electron.autoClicker.stop()

  const handleRecordShortcut = () => {
    setIsRecording(true)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      
      let newShortcut = ''
      if (e.ctrlKey) newShortcut += 'CommandOrControl+'
      if (e.altKey) newShortcut += 'Alt+'
      if (e.shiftKey) newShortcut += 'Shift+'
      
      let key = e.key.toUpperCase()
      if (key === ' ') key = 'Space'
      if (key === 'ARROWUP') key = 'Up'
      if (key === 'ARROWDOWN') key = 'Down'
      if (key === 'ARROWLEFT') key = 'Left'
      if (key === 'ARROWRIGHT') key = 'Right'

      newShortcut += key
      
      setShortcut(newShortcut.replace('CommandOrControl+', 'Ctrl+'))
      window.electron.autoClicker.updateConfig({ shortcut: newShortcut })
      setIsRecording(false)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
    window.addEventListener('keydown', handleKeyDown, true)
  }

  return (
    <div className='max-w-6xl mx-auto space-y-10 py-4 animate-in fade-in slide-in-from-bottom-6 duration-1000'>
      {/* Header */}
      <div className='flex items-center justify-between px-2'>
        <div className='space-y-1'>
          <h1 className='text-5xl font-black tracking-tighter bg-gradient-to-br from-foreground to-foreground/40 bg-clip-text text-transparent'>
            赛博连点器
          </h1>
          <p className='text-muted-foreground flex items-center gap-2 text-sm font-medium tracking-wide'>
            <span className='h-2 w-2 rounded-full bg-purple-500 animate-pulse' />
            赛博连点 · 功德无量
          </p>
        </div>
        
        <div className='flex flex-col items-end gap-1'>
          <span className='text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]'>系统引擎</span>
          <div className={cn(
            "px-4 py-1.5 rounded-full text-xs font-black transition-all duration-500 border",
            isRunning 
              ? "bg-purple-500/10 border-purple-500/50 text-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]" 
              : "bg-muted/50 border-border text-muted-foreground"
          )}>
            {isRunning ? "● 引擎运行中" : "○ 引擎待命"}
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-10'>
        {/* Play Area */}
        <div className='lg:col-span-7'>
          <div className='glass-card rounded-[40px] p-10 flex flex-col items-center justify-center min-h-[520px] relative overflow-hidden group cursor-crosshair'>
            <div className='absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none' />
            
            <div className='relative' onClick={handleWoodenFishClick}>
              {ripples.map(r => (
                <div key={r.id} className='ripple-effect' style={{ left: r.x, top: r.y }} />
              ))}
              
              <WoodenFishSVG isShaking={isShaking} isRunning={isRunning} />
              
              {particles.map(p => (
                <span key={p.id} className='merit-text text-3xl' style={{ left: p.x, top: p.y }}>
                  功德 +1
                </span>
              ))}
            </div>

            <div className='mt-12 text-center relative z-10'>
              <div className='text-7xl font-black text-foreground mb-1 tracking-tighter tabular-nums drop-shadow-sm'>
                {meritCount.toLocaleString()}
              </div>
              <div className='text-[10px] text-muted-foreground tracking-[0.4em] uppercase font-black opacity-60'>
                当前累计功德
              </div>
              <button 
                onClick={() => setMeritCount(0)}
                className='mt-6 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-purple-500 hover:bg-purple-500/5 transition-all duration-300'
              >
                重置功德记录
              </button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className='lg:col-span-5 space-y-8'>
          <div className={cn(
            'glass-card rounded-[40px] p-8 space-y-10 transition-all duration-700',
            isRunning && 'running-glow'
          )}>
            <div className='space-y-6'>
              <Button
                size='lg'
                onClick={isRunning ? handleStop : handleStart}
                className={cn(
                  "w-full h-20 text-xl font-black rounded-3xl transition-all duration-500 active:scale-95",
                  isRunning 
                    ? "bg-foreground text-background hover:bg-foreground/90 shadow-2xl" 
                    : "bg-purple-600 hover:bg-purple-500 text-white shadow-[0_15px_30px_rgba(168,85,247,0.4)]"
                )}
              >
                {isRunning ? (
                  <span className='flex items-center gap-3'><Square className='h-6 w-6 fill-current' /> 停止运行</span>
                ) : (
                  <span className='flex items-center gap-3'><Play className='h-6 w-6 fill-current' /> 开启连点</span>
                )}
              </Button>

              <div className='flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50'>
                <div className='space-y-1'>
                  <Label className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>快捷键切换</Label>
                  <p className='text-xs font-bold text-foreground/70'>快捷键启动/停止</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecordShortcut}
                  className={cn(
                    "font-black h-10 min-w-[100px] rounded-xl border-2 transition-all duration-300",
                    isRecording 
                      ? "animate-pulse border-purple-500 text-purple-500 bg-purple-500/5" 
                      : "border-border hover:border-purple-500/50"
                  )}
                >
                  {isRecording ? "正在录制..." : shortcut}
                </Button>
              </div>
            </div>

            <div className='space-y-10'>
              <div className='space-y-6'>
                <div className='flex justify-between items-center'>
                  <Label className='text-xs font-black uppercase tracking-widest text-muted-foreground'>点击间隔</Label>
                  <div className='flex items-baseline gap-1'>
                    <span className='text-3xl font-black tabular-nums text-purple-500'>{clickInterval}</span>
                    <span className='text-[10px] font-bold text-muted-foreground'>毫秒</span>
                  </div>
                </div>
                <input
                  type='range'
                  min={10}
                  max={1000}
                  step={10}
                  value={clickInterval}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    setClickInterval(val)
                    if (!isRunning) window.electron.autoClicker.updateConfig({ interval: val })
                  }}
                  className='custom-slider'
                  disabled={isRunning}
                />
                <div className='flex justify-between text-[10px] font-black text-muted-foreground/40 uppercase tracking-tighter'>
                  <span>极速 (10ms)</span>
                  <span>稳定 (1000ms)</span>
                </div>
              </div>

              <div className='space-y-5'>
                <Label className='text-xs font-black uppercase tracking-widest text-muted-foreground'>触发按键</Label>
                <RadioGroup
                  value={button}
                  onValueChange={(v) => {
                    setButton(v as any)
                    if (!isRunning) window.electron.autoClicker.updateConfig({ button: v })
                  }}
                  className='grid grid-cols-3 gap-3'
                  disabled={isRunning}
                >
                  {[
                    { id: 'left', label: '左键' },
                    { id: 'right', label: '右键' },
                    { id: 'middle', label: '中键' }
                  ].map((item) => (
                    <div key={item.id}>
                      <RadioGroupItem value={item.id} id={item.id} className="sr-only" />
                      <Label
                        htmlFor={item.id}
                        className={cn(
                          "flex items-center justify-center h-12 rounded-2xl border-2 transition-all duration-300 cursor-pointer text-xs font-black tracking-widest",
                          button === item.id 
                            ? "bg-purple-500/10 border-purple-500 text-purple-500 shadow-inner" 
                            : "bg-muted/20 border-transparent text-muted-foreground hover:bg-muted/40"
                        )}
                      >
                        {item.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </div>

          <div className='glass-card rounded-[30px] p-6 bg-gradient-to-br from-purple-500/5 to-transparent'>
            <div className='flex items-center gap-4'>
              <div className='h-10 w-10 rounded-2xl bg-purple-500/10 flex items-center justify-center'>
                <Info className='h-5 w-5 text-purple-500' />
              </div>
              <div className='space-y-0.5'>
                <h3 className='text-xs font-black uppercase tracking-widest'>优化信息</h3>
                <p className='text-[10px] text-muted-foreground font-medium'>
                  系统已优化点击延迟，支持全屏游戏及多任务后台静默运行。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AutoClickerTool

