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

  @keyframes fish-pulse {
    0% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(139, 92, 246, 0)); }
    50% { transform: scale(0.95); filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.4)); }
    100% { transform: scale(1); filter: drop-shadow(0 0 0px rgba(139, 92, 246, 0)); }
  }

  @keyframes border-flow {
    0% { background-position: 0% 50%; }
    100% { background-position: 200% 50%; }
  }

  .glass-card {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
  }

  .merit-text {
    position: absolute;
    pointer-events: none;
    animation: merit-float 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    font-weight: 800;
    background: linear-gradient(to bottom, #fff, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 10px 20px rgba(168, 85, 247, 0.3);
  }

  .running-glow {
    position: relative;
  }
  
  .running-glow::after {
    content: '';
    position: absolute;
    inset: -2px;
    background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6);
    background-size: 200% 100%;
    animation: border-flow 2s linear infinite;
    border-radius: inherit;
    z-index: -1;
    opacity: 0.5;
    blur: 8px;
  }
`

const WoodenFishSVG: React.FC<{ isShaking: boolean; isRunning: boolean }> = ({ isShaking, isRunning }) => (
  <svg 
    viewBox="0 0 200 200" 
    className={cn(
      "w-48 h-48 transition-all duration-200 cursor-pointer",
      isShaking && "scale-90",
      isRunning && "animate-pulse"
    )}
  >
    <defs>
      <linearGradient id="fishGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#333" />
        <stop offset="100%" stopColor="#111" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <path
      d="M40,100 Q40,40 100,40 Q160,40 160,100 Q160,160 100,160 Q40,160 40,100"
      fill="url(#fishGrad)"
      stroke="rgba(255,255,255,0.1)"
      strokeWidth="2"
    />
    <path
      d="M60,100 Q60,70 100,70 Q140,70 140,100 Q140,130 100,130 Q60,130 60,100"
      fill="none"
      stroke="rgba(168, 85, 247, 0.4)"
      strokeWidth="1"
      opacity="0.5"
    />
    <circle cx="100" cy="100" r="15" fill="rgba(168, 85, 247, 0.2)" />
    <circle cx="100" cy="100" r="5" fill="#a855f7" />
  </svg>
)

export const AutoClickerTool: React.FC = () => {
  const [clickInterval, setClickInterval] = useState(100)
  const [button, setButton] = useState<'left' | 'right' | 'middle'>('left')
  const [isRunning, setIsRunning] = useState(false)
  const [meritCount, setMeritCount] = useState(() => {
    const saved = localStorage.getItem('meritCount')
    return saved ? parseInt(saved) : 0
  })
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([])
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
      window.electron.ipcRenderer.on('autoclicker-started', handleStarted)
      window.electron.ipcRenderer.on('autoclicker-stopped', handleStopped)
      return () => {
        window.electron.ipcRenderer.removeListener('autoclicker-started', handleStarted)
        window.electron.ipcRenderer.removeListener('autoclicker-stopped', handleStopped)
      }
    }
  }, [])

  const checkStatus = useCallback(async () => {
    try {
      const status = await window.electron.autoClicker.getStatus()
      setIsRunning(status.running)
      if (status.config) {
        setClickInterval(status.config.interval)
        setButton(status.config.button as any)
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
    
    const newParticle = { id: Date.now(), x, y }
    setParticles(prev => [...prev, newParticle])
    setTimeout(() => {
      setParticles(prev => prev.filter(p => p.id !== newParticle.id))
    }, 1500)
  }, [])

  const handleStart = () => window.electron.autoClicker.start({ interval: clickInterval, button })
  const handleStop = () => window.electron.autoClicker.stop()

  return (
    <div className='max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700'>
      {/* 顶部标题区 */}
      <div className='flex items-end justify-between border-b border-white/10 pb-6'>
        <div>
          <h1 className='text-4xl font-black tracking-tight bg-gradient-to-r from-white via-white/80 to-white/50 bg-clip-text text-transparent'>
            鼠标连点器
          </h1>
          <p className='text-muted-foreground mt-2 flex items-center gap-2'>
            <Zap className='h-4 w-4 text-purple-400' />
            极速连点，解放双手
          </p>
        </div>
        <div className='text-right'>
          <div className='text-xs font-mono text-muted-foreground uppercase tracking-widest'>Status</div>
          <div className={cn(
            "text-sm font-bold transition-colors duration-500",
            isRunning ? "text-purple-400" : "text-muted-foreground"
          )}>
            {isRunning ? "● RUNNING" : "○ IDLE"}
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-8'>
        {/* 左侧：赛博木鱼测试区 */}
        <div className='lg:col-span-7 space-y-6'>
          <div className='glass-card rounded-3xl p-8 flex flex-col items-center justify-center min-h-[450px] relative overflow-hidden group'>
            {/* 背景装饰 */}
            <div className='absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none' />
            <div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-purple-500/20 transition-all duration-700' />

            <div className='relative mb-8' onClick={handleWoodenFishClick}>
              <WoodenFishSVG isShaking={isShaking} isRunning={isRunning} />
              {particles.map(p => (
                <span key={p.id} className='merit-text text-xl' style={{ left: p.x, top: p.y }}>
                  功德 +1
                </span>
              ))}
            </div>

            <div className='text-center z-10'>
              <div className='text-6xl font-black text-white mb-2 tracking-tighter'>
                {meritCount.toLocaleString()}
              </div>
              <div className='text-sm text-muted-foreground tracking-[0.2em] uppercase'>
                Accumulated Merit
              </div>
              <Button 
                variant='ghost' 
                size='sm' 
                onClick={() => setMeritCount(0)}
                className='mt-4 text-white/30 hover:text-white/60 transition-colors'
              >
                Reset Merit
              </Button>
            </div>
          </div>
        </div>

        {/* 右侧：控制面板 */}
        <div className='lg:col-span-5 space-y-6'>
          {/* 主控制卡片 */}
          <div className={cn(
            'glass-card rounded-3xl p-6 transition-all duration-500',
            isRunning && 'running-glow border-transparent'
          )}>
            <div className='flex flex-col gap-4'>
              <Button
                size='lg'
                onClick={isRunning ? handleStop : handleStart}
                className={cn(
                  "h-16 text-lg font-bold rounded-2xl transition-all duration-300",
                  isRunning 
                    ? "bg-white text-black hover:bg-white/90" 
                    : "bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                )}
              >
                {isRunning ? (
                  <><Square className='mr-2 h-5 w-5 fill-current' /> 停止连点</>
                ) : (
                  <><Play className='mr-2 h-5 w-5 fill-current' /> 开始连点</>
                )}
              </Button>
              
              <div className='flex items-center justify-center gap-6 text-xs text-muted-foreground'>
                <div className='flex items-center gap-1.5'>
                  <kbd className='px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-mono'>F6</kbd>
                  <span>Toggle</span>
                </div>
                <div className='flex items-center gap-1.5'>
                  <kbd className='px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded border border-red-500/20 font-mono'>F8</kbd>
                  <span>Stop</span>
                </div>
              </div>
            </div>

            <div className='mt-8 space-y-8'>
              <div className='space-y-4'>
                <div className='flex justify-between items-end'>
                  <Label className='text-sm font-medium text-white/70'>点击间隔</Label>
                  <span className='text-xl font-mono font-bold text-purple-400'>
                    {clickInterval} <span className='text-xs text-muted-foreground'>ms</span>
                  </span>
                </div>
                <Input
                  type='range'
                  min={10}
                  max={1000}
                  step={10}
                  value={clickInterval}
                  onChange={(e) => setClickInterval(parseInt(e.target.value))}
                  className='h-2 bg-white/5 accent-purple-500'
                  disabled={isRunning}
                />
              </div>

              <div className='space-y-4'>
                <Label className='text-sm font-medium text-white/70'>鼠标按键</Label>
                <RadioGroup
                  value={button}
                  onValueChange={(v) => setButton(v as any)}
                  className='grid grid-cols-3 gap-2'
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
                          "flex items-center justify-center h-10 rounded-xl border transition-all cursor-pointer text-sm",
                          button === item.id 
                            ? "bg-purple-500/20 border-purple-500 text-purple-400" 
                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
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

          {/* 快捷指南 */}
          <div className='glass-card rounded-3xl p-6'>
            <h3 className='text-sm font-bold flex items-center gap-2 mb-4'>
              <Info className='h-4 w-4 text-purple-400' />
              使用指南
            </h3>
            <div className='space-y-3'>
              {[
                { icon: Keyboard, text: '全局热键支持后台操作' },
                { icon: MousePointer, text: '支持最高 100次/秒 点击频率' },
                { icon: AlertCircle, text: '按 F8 键可在任何时刻紧急停止' }
              ].map((item, idx) => (
                <div key={idx} className='flex items-center gap-3 text-xs text-white/50'>
                  <item.icon className='h-3.5 w-3.5' />
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AutoClickerTool

