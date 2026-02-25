import React, { useState, useCallback, useEffect } from 'react'
import {
  Radar,
  RefreshCw,
  Globe,
  Activity,
  XCircle
} from 'lucide-react'

interface PingResult {
  host: string
  name: string
  latency: number | null
  status: 'pending' | 'success' | 'error' | 'timeout'
  icon?: string
}

const styles = `
  @keyframes radar-sweep {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes ping-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.5; }
  }

  @keyframes fade-in-up {
    0% { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .radar-container {
    position: relative;
    width: 200px;
    height: 200px;
  }

  .radar-circle {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }

  .radar-sweep {
    position: absolute;
    width: 50%;
    height: 50%;
    top: 0;
    left: 50%;
    transform-origin: bottom left;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(59, 130, 246, 0.1),
      rgba(59, 130, 246, 0.3)
    );
    animation: radar-sweep 3s linear infinite;
    border-radius: 0 100% 0 0;
  }

  .radar-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 12px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    border-radius: 50%;
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
  }

  .radar-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: ping-dot 2s ease-in-out infinite;
  }

  .fade-in-up {
    animation: fade-in-up 0.5s ease-out forwards;
  }
`

const PING_TARGETS: Omit<PingResult, 'latency' | 'status'>[] = [
  { host: 'https://www.baidu.com', name: '百度', icon: '🔍' },
  { host: 'https://www.qq.com', name: '腾讯', icon: '🐧' },
  { host: 'https://www.taobao.com', name: '淘宝', icon: '🛒' },
  { host: 'https://www.bilibili.com', name: 'B站', icon: '📺' },
  { host: 'https://www.zhihu.com', name: '知乎', icon: '💬' },
  { host: 'https://www.weibo.com', name: '微博', icon: '📱' },
  { host: 'https://www.google.com', name: 'Google', icon: '🌐' },
  { host: 'https://www.github.com', name: 'GitHub', icon: '💻' },
  { host: 'https://www.youtube.com', name: 'YouTube', icon: '🎬' },
  { host: 'https://www.twitter.com', name: 'Twitter', icon: '🐦' },
]

const getLatencyColor = (latency: number | null): string => {
  if (latency === null) return 'text-muted-foreground'
  if (latency < 50) return 'text-green-500'
  if (latency < 100) return 'text-lime-500'
  if (latency < 200) return 'text-yellow-500'
  if (latency < 500) return 'text-orange-500'
  return 'text-red-500'
}

const getLatencyBgColor = (latency: number | null): string => {
  if (latency === null) return 'bg-muted/50'
  if (latency < 50) return 'bg-green-500/20'
  if (latency < 100) return 'bg-lime-500/20'
  if (latency < 200) return 'bg-yellow-500/20'
  if (latency < 500) return 'bg-orange-500/20'
  return 'bg-red-500/20'
}

export const NetworkRadarTool: React.FC = () => {
  const [pingResults, setPingResults] = useState<PingResult[]>(
    PING_TARGETS.map(t => ({ ...t, latency: null, status: 'pending' }))
  )
  const [isPinging, setIsPinging] = useState(false)

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)

    return () => {
      document.head.removeChild(styleSheet)
    }
  }, [])

  const pingHost = useCallback(async (host: string): Promise<number | null> => {
    const startTime = performance.now()
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      await fetch(host, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      const endTime = performance.now()
      return Math.round(endTime - startTime)
    } catch {
      return null
    }
  }, [])

  const runPingTest = useCallback(async () => {
    setIsPinging(true)
    setPingResults(prev => prev.map(r => ({ ...r, latency: null, status: 'pending' })))
    
    const results = [...pingResults]
    
    for (let i = 0; i < PING_TARGETS.length; i++) {
      const latency = await pingHost(PING_TARGETS[i].host)
      results[i] = {
        ...PING_TARGETS[i],
        latency,
        status: latency !== null ? 'success' : 'error'
      }
      setPingResults([...results])
    }
    
    setIsPinging(false)
  }, [pingHost])

  const successfulPings = pingResults.filter(r => r.status === 'success')
  const avgLatency = successfulPings.length > 0
    ? Math.round(successfulPings.reduce((sum, r) => sum + (r.latency || 0), 0) / successfulPings.length)
    : null

  const renderRadar = () => {
    const dots = successfulPings.map((result, index) => {
      const angle = (index / successfulPings.length) * 2 * Math.PI - Math.PI / 2
      const distance = 60 + (result.latency ? Math.min(result.latency / 10, 35) : 0)
      const x = 100 + Math.cos(angle) * distance
      const y = 100 + Math.sin(angle) * distance
      
      let color = '#ef4444'
      if (result.latency !== null) {
        if (result.latency < 50) color = '#22c55e'
        else if (result.latency < 100) color = '#84cc16'
        else if (result.latency < 200) color = '#eab308'
        else if (result.latency < 500) color = '#f97316'
      }
      
      return (
        <div
          key={result.host}
          className="radar-dot"
          style={{
            left: `${x}px`,
            top: `${y}px`,
            backgroundColor: color
          }}
          title={`${result.name}: ${result.latency}ms`}
        />
      )
    })

    return (
      <div className="radar-container mx-auto">
        <div className="radar-circle" style={{ width: '100%', height: '100%', top: 0, left: 0 }} />
        <div className="radar-circle" style={{ width: '75%', height: '75%', top: '12.5%', left: '12.5%' }} />
        <div className="radar-circle" style={{ width: '50%', height: '50%', top: '25%', left: '25%' }} />
        <div className="radar-circle" style={{ width: '25%', height: '25%', top: '37.5%', left: '37.5%' }} />
        <div className="radar-sweep" />
        <div className="radar-center" />
        {dots}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8 fade-in-up">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10">
            <Radar className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            网络雷达
          </h1>
        </div>
        <p className="text-muted-foreground">实时监测网络延迟</p>
      </div>

      <div className="space-y-6 fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              已检测 <span className="text-primary font-semibold">{successfulPings.length}</span> / {pingResults.length} 个节点
            </div>
            {avgLatency !== null && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${getLatencyBgColor(avgLatency)}`}>
                <Activity className={`w-4 h-4 ${getLatencyColor(avgLatency)}`} />
                <span className={`font-semibold ${getLatencyColor(avgLatency)}`}>
                  平均延迟: {avgLatency}ms
                </span>
              </div>
            )}
          </div>
          <button
            onClick={runPingTest}
            disabled={isPinging}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium transition-all duration-300 hover:shadow-soft-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
            {isPinging ? '检测中...' : '开始检测'}
          </button>
        </div>

        <div className="flex justify-center py-4">
          {renderRadar()}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {pingResults.map((result, index) => (
            <div
              key={result.host}
              className="p-4 rounded-xl bg-white/40 dark:bg-black/20 border border-white/20 dark:border-white/10 backdrop-blur-sm transition-all duration-300 hover:bg-white/60 dark:hover:bg-black/30 fade-in-up"
              style={{ animationDelay: `${0.2 + index * 0.05}s` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{result.icon}</span>
                  <div>
                    <div className="font-medium">{result.name}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[150px]">{result.host}</div>
                  </div>
                </div>
                <div className="text-right">
                  {result.status === 'pending' && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">等待中</span>
                    </div>
                  )}
                  {result.status === 'success' && (
                    <div className={`font-bold text-lg ${getLatencyColor(result.latency)}`}>
                      {result.latency}ms
                    </div>
                  )}
                  {result.status === 'error' && (
                    <div className="flex items-center gap-1 text-red-500">
                      <XCircle className="w-4 h-4" />
                      <span className="text-sm">超时</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs text-muted-foreground fade-in-up" style={{ animationDelay: '0.4s' }}>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>&lt;50ms 极佳</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-lime-500" />
            <span>50-100ms 良好</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span>100-200ms 一般</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span>200-500ms 较慢</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>&gt;500ms 很慢</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NetworkRadarTool
