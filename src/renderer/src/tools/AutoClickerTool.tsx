import React, { useState, useCallback, useEffect } from 'react'
import { MousePointer, Play, Square, Settings, Info, ChevronRight, Keyboard, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

const styles = `
  @keyframes merit-float {
    0% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(-100px) scale(1.5);
    }
  }

  @keyframes wooden-fish-shake {
    0%, 100% { transform: rotate(0deg) scale(1); }
    25% { transform: rotate(-8deg) scale(0.92); }
    50% { transform: rotate(0deg) scale(0.85); }
    75% { transform: rotate(8deg) scale(0.92); }
  }

  @keyframes glow-pulse {
    0%, 100% { 
      box-shadow: 0 0 30px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2);
    }
    50% { 
      box-shadow: 0 0 50px rgba(139, 92, 246, 0.6), 0 0 100px rgba(139, 92, 246, 0.3);
    }
  }

  @keyframes ripple {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2); opacity: 0; }
  }

  @keyframes pulse-red {
    0%, 100% { background-color: rgb(239, 68, 68); }
    50% { background-color: rgb(248, 113, 113); }
  }

  .merit-particle {
    position: absolute;
    pointer-events: none;
    animation: merit-float 1.8s ease-out forwards;
    font-size: 1.5rem;
    font-weight: bold;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
    white-space: nowrap;
    z-index: 10;
  }

  .wooden-fish {
    cursor: pointer;
    user-select: none;
    transition: transform 0.1s ease;
  }

  .wooden-fish:active {
    animation: wooden-fish-shake 0.3s ease-out;
  }

  .wooden-fish-glow {
    animation: glow-pulse 2s ease-in-out infinite;
  }

  .ripple-effect {
    position: absolute;
    border-radius: 50%;
    border: 3px solid rgba(139, 92, 246, 0.6);
    animation: ripple 0.6s ease-out forwards;
    pointer-events: none;
  }

  .emergency-stop-pulse {
    animation: pulse-red 1s ease-in-out infinite;
  }
`

const WoodenFishSVG: React.FC<{ isShaking: boolean }> = ({ isShaking }) => (
  <svg 
    viewBox="0 0 200 200" 
    className={cn(
      "w-40 h-40 transition-transform duration-100",
      isShaking && "animate-[wooden-fish-shake_0.3s_ease-out]"
    )}
  >
    <defs>
      <radialGradient id="woodGradient" cx="35%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="40%" stopColor="#d97706" />
        <stop offset="80%" stopColor="#b45309" />
        <stop offset="100%" stopColor="#92400e" />
      </radialGradient>
      <radialGradient id="innerGradient" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#fcd34d" />
        <stop offset="50%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#d97706" />
      </radialGradient>
      <radialGradient id="centerGradient" cx="45%" cy="45%" r="55%">
        <stop offset="0%" stopColor="#78350f" />
        <stop offset="100%" stopColor="#451a03" />
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000" floodOpacity="0.4"/>
      </filter>
      <filter id="innerGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
        <feOffset in="blur" dx="0" dy="2" result="offsetBlur"/>
        <feMerge>
          <feMergeNode in="offsetBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    <ellipse 
      cx="100" cy="102" rx="82" ry="72" 
      fill="#78350f" 
      opacity="0.3"
    />
    
    <ellipse 
      cx="100" cy="100" rx="85" ry="75" 
      fill="url(#woodGradient)" 
      filter="url(#shadow)"
      stroke="#78350f"
      strokeWidth="2"
    />
    
    <ellipse 
      cx="100" cy="100" rx="70" ry="60" 
      fill="none"
      stroke="#fbbf24"
      strokeWidth="1"
      opacity="0.3"
    />
    
    <ellipse 
      cx="100" cy="100" rx="60" ry="50" 
      fill="url(#innerGradient)"
      stroke="#92400e"
      strokeWidth="2"
      filter="url(#innerGlow)"
    />
    
    <ellipse 
      cx="100" cy="100" rx="32" ry="27" 
      fill="url(#centerGradient)"
      stroke="#78350f"
      strokeWidth="1.5"
    />
    
    <ellipse 
      cx="100" cy="100" rx="15" ry="12" 
      fill="#1c0a00"
      stroke="#451a03"
      strokeWidth="1"
    />
    
    <ellipse 
      cx="96" cy="96" rx="5" ry="4" 
      fill="rgba(255,255,255,0.1)"
    />
    
    <ellipse 
      cx="75" cy="70" rx="20" ry="12" 
      fill="rgba(255,255,255,0.12)"
    />
    
    <path 
      d="M 45 55 Q 25 100 45 145" 
      stroke="#78350f" 
      strokeWidth="2.5" 
      fill="none"
      opacity="0.4"
    />
    <path 
      d="M 155 55 Q 175 100 155 145" 
      stroke="#78350f" 
      strokeWidth="2.5" 
      fill="none"
      opacity="0.4"
    />
    
    <circle cx="60" cy="85" r="2" fill="#fbbf24" opacity="0.4" />
    <circle cx="140" cy="85" r="2" fill="#fbbf24" opacity="0.4" />
    <circle cx="70" cy="120" r="1.5" fill="#fbbf24" opacity="0.3" />
    <circle cx="130" cy="120" r="1.5" fill="#fbbf24" opacity="0.3" />
    
    <path 
      d="M 85 145 Q 100 155 115 145" 
      stroke="#fbbf24" 
      strokeWidth="1.5" 
      fill="none"
      opacity="0.3"
    />
  </svg>
)

interface MeritParticle {
  id: number
  x: number
  y: number
}

export const AutoClickerTool: React.FC = () => {
  const [clickInterval, setClickInterval] = useState(100)
  const [button, setButton] = useState<'left' | 'right' | 'middle'>('left')
  const [isRunning, setIsRunning] = useState(false)
  const [meritCount, setMeritCount] = useState(() => {
    const saved = localStorage.getItem('meritCount')
    return saved ? parseInt(saved) : 0
  })
  const [particles, setParticles] = useState<MeritParticle[]>([])
  const [isShaking, setIsShaking] = useState(false)
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F6') {
        e.preventDefault()
        if (isRunning) {
          handleStop()
        } else {
          handleStart()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRunning, clickInterval, button])

  const checkStatus = useCallback(async () => {
    try {
      const status = await window.electron.autoClicker.getStatus()
      setIsRunning(status.running)
    } catch (error) {
      console.error('Failed to get status:', error)
    }
  }, [])

  useEffect(() => {
    checkStatus()
    const intervalCheck = window.setInterval(checkStatus, 1000)
    return () => window.clearInterval(intervalCheck)
  }, [checkStatus])

  useEffect(() => {
    const handleStopped = () => {
      console.log('Autoclicker stopped via global shortcut')
      setIsRunning(false)
    }
    
    if (window.electron.ipcRenderer) {
      window.electron.ipcRenderer.on('autoclicker-stopped', handleStopped)
      return () => {
        window.electron.ipcRenderer.removeListener('autoclicker-stopped', handleStopped)
      }
    }
  }, [])

  const handleWoodenFishClick = useCallback((e: React.MouseEvent) => {
    setMeritCount(prev => prev + 1)
    setIsShaking(true)
    setTimeout(() => setIsShaking(false), 300)
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const newParticle: MeritParticle = {
      id: Date.now(),
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100
    }
    setParticles(prev => [...prev, newParticle])
    
    const ripple = { id: Date.now(), x, y }
    setRipples(prev => [...prev, ripple])
    
    setTimeout(() => {
      setParticles(prev => prev.filter(p => p.id !== newParticle.id))
    }, 1800)
    
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== ripple.id))
    }, 600)
  }, [])

  const handleStart = async () => {
    try {
      console.log('Starting autoclicker with:', { interval: clickInterval, button })
      const result = await window.electron.autoClicker.start({ interval: clickInterval, button })
      if (result.success) {
        console.log('Autoclicker started successfully')
        setIsRunning(true)
      } else {
        console.error('Start failed:', result.error)
      }
    } catch (error) {
      console.error('Failed to start:', error)
    }
  }

  const handleStop = async () => {
    try {
      console.log('Stopping autoclicker')
      const result = await window.electron.autoClicker.stop()
      if (result.success) {
        console.log('Autoclicker stopped successfully')
        setIsRunning(false)
      }
    } catch (error) {
      console.error('Failed to stop:', error)
    }
  }

  const resetMerit = () => {
    setMeritCount(0)
    localStorage.removeItem('meritCount')
  }

  return (
    <div className='space-y-6'>
      <div className='text-center mb-8'>
        <h1 className='text-3xl font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 bg-clip-text text-transparent mb-2'>
          鼠标连点器
        </h1>
        <p className='text-muted-foreground'>自定义热键和点击频率的自动点击工具</p>
      </div>

      <Card className='bg-gradient-to-br from-red-500/10 via-orange-500/10 to-amber-500/10 border-red-500/20 mb-4'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2 text-red-600 dark:text-red-400'>
            <AlertTriangle className='h-5 w-5' />
            ⚠️ 紧急停止
          </CardTitle>
          <CardDescription>
            无论何时，按下 <kbd className='px-2 py-1 bg-red-500/20 rounded text-xs font-mono text-red-600 dark:text-red-400'>F8</kbd> 立即停止连点！
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className='bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10 border-amber-500/20'>
        <CardHeader>
          <CardTitle className='text-center text-amber-600 dark:text-amber-400'>
            📿 赛博木鱼
          </CardTitle>
          <CardDescription className='text-center'>
            点击木鱼积累功德，测试连点效果
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col items-center'>
            <div 
              className='relative w-52 h-52 flex items-center justify-center mb-4 wooden-fish'
              onClick={handleWoodenFishClick}
            >
              <div className={cn(
                'wooden-fish-glow rounded-full p-4',
                'bg-gradient-to-br from-amber-100/20 to-orange-200/20'
              )}>
                <WoodenFishSVG isShaking={isShaking} />
              </div>
              
              {particles.map(particle => (
                <div
                  key={particle.id}
                  className='merit-particle'
                  style={{
                    left: `${particle.x}%`,
                    top: `${particle.y}%`
                  }}
                >
                  功德+1 ✨
                </div>
              ))}
              
              {ripples.map(ripple => (
                <div
                  key={ripple.id}
                  className='ripple-effect'
                  style={{
                    left: ripple.x - 40,
                    top: ripple.y - 40,
                    width: 80,
                    height: 80
                  }}
                />
              ))}
            </div>
            
            <div className='text-center'>
              <div className='text-5xl font-bold bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent mb-1'>
                {meritCount.toLocaleString()}
              </div>
              <div className='text-sm text-muted-foreground mb-3'>累计功德</div>
              <Button 
                variant='ghost' 
                size='sm' 
                onClick={resetMerit}
                className='text-xs text-muted-foreground hover:text-amber-500'
              >
                重置功德
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cn(
        'bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20 transition-all duration-300',
        isRunning ? 'border-green-500/50 bg-green-500/5' : ''
      )}>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <MousePointer className='h-5 w-5' />
                状态
              </CardTitle>
              <CardDescription>
                {isRunning ? '连点器正在运行中...按 F8 紧急停止！' : '连点器已停止'}
              </CardDescription>
            </div>
            <div className={cn(
              'px-4 py-2 rounded-full text-sm font-medium',
              isRunning ? 'bg-green-500 text-white animate-pulse' : 'bg-muted text-muted-foreground'
            )}>
              {isRunning ? '● 连点中' : '○ 已停止'}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col sm:flex-row gap-4'>
            <Button
              className='flex-1'
              size='lg'
              onClick={handleStart}
              disabled={isRunning}
              variant={isRunning ? 'secondary' : 'default'}
            >
              <Play className='mr-2 h-5 w-5' />
              开始连点
            </Button>
            <Button
              className='flex-1'
              size='lg'
              onClick={handleStop}
              disabled={!isRunning}
              variant='destructive'
            >
              <Square className='mr-2 h-5 w-5' />
              停止连点
            </Button>
          </div>
          <div className='mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground'>
            <Keyboard className='h-4 w-4' />
            <span>按 <kbd className='px-2 py-1 bg-muted rounded text-xs font-mono'>F6</kbd> 快速切换启动/停止</span>
          </div>
          {isRunning && (
            <div className='mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg'>
              <div className='flex items-center gap-2 text-red-600 dark:text-red-400 font-medium'>
                <AlertTriangle className='h-4 w-4' />
                <span>连点进行中！按 <kbd className='px-1.5 py-0.5 bg-red-500/20 rounded text-xs font-mono emergency-stop-pulse text-white'>F8</kbd> 立即停止！</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className='bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Settings className='h-5 w-5' />
            点击设置
          </CardTitle>
          <CardDescription>配置点击频率和鼠标按键</CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='space-y-3'>
            <Label htmlFor='interval'>点击间隔 (毫秒)</Label>
            <div className='flex items-center gap-4'>
              <Input
                id='interval'
                type='number'
                value={clickInterval}
                onChange={(e) => setClickInterval(Math.max(10, parseInt(e.target.value) || 100))}
                min={10}
                max={5000}
                className='w-32'
                disabled={isRunning}
              />
              <input
                type='range'
                min={10}
                max={1000}
                value={Math.min(clickInterval, 1000)}
                onChange={(e) => setClickInterval(parseInt(e.target.value))}
                className='flex-1'
                disabled={isRunning}
              />
              <span className='text-sm text-muted-foreground w-20'>
                {clickInterval >= 1000 ? `${(clickInterval / 1000).toFixed(1)}秒` : `${clickInterval}ms`}
              </span>
            </div>
            <p className='text-xs text-muted-foreground'>范围: 10ms - 5000ms</p>
          </div>

          <div className='space-y-3'>
            <Label>鼠标按键</Label>
            <RadioGroup
              value={button}
              onValueChange={(v) => setButton(v as 'left' | 'right' | 'middle')}
              className='flex flex-wrap gap-4'
              disabled={isRunning}
            >
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='left' id='left' disabled={isRunning} />
                <Label htmlFor='left' className='cursor-pointer'>左键</Label>
              </div>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='right' id='right' disabled={isRunning} />
                <Label htmlFor='right' className='cursor-pointer'>右键</Label>
              </div>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='middle' id='middle' disabled={isRunning} />
                <Label htmlFor='middle' className='cursor-pointer'>中键</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card className='bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl border-white/20'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Info className='h-5 w-5' />
            使用说明
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex items-start gap-3'>
            <ChevronRight className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
            <div>
              <h4 className='font-medium'>赛博木鱼</h4>
              <p className='text-sm text-muted-foreground'>点击木鱼积累功德，可用于测试连点效果</p>
            </div>
          </div>
          <div className='flex items-start gap-3'>
            <ChevronRight className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
            <div>
              <h4 className='font-medium'>设置参数</h4>
              <p className='text-sm text-muted-foreground'>先设置点击间隔和鼠标按键，然后点击开始启动连点</p>
            </div>
          </div>
          <div className='flex items-start gap-3'>
            <ChevronRight className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
            <div>
              <h4 className='font-medium'>快捷键</h4>
              <p className='text-sm text-muted-foreground'>
                按 <kbd className='px-1.5 py-0.5 bg-muted rounded text-xs font-mono'>F6</kbd> 快速切换启动/停止，
                按 <kbd className='px-1.5 py-0.5 bg-red-500/20 rounded text-xs font-mono text-red-600 dark:text-red-400'>F8</kbd> 紧急停止
              </p>
            </div>
          </div>
          <div className='flex items-start gap-3'>
            <ChevronRight className='h-5 w-5 text-primary flex-shrink-0 mt-0.5' />
            <div>
              <h4 className='font-medium'>后台运行</h4>
              <p className='text-sm text-muted-foreground'>最小化窗口后连点器仍会继续工作</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
