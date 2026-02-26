import React, { useState, useCallback, useEffect } from 'react'
import {
  Radar,
  RefreshCw,
  Globe,
  Activity,
  XCircle,
  Wifi,
  Monitor,
  ShieldCheck,
  Zap,
  Server
} from 'lucide-react'

interface NetworkInfo {
  name: string
  description: string
  type: 'Wi-Fi' | '以太网'
  speed: string
  ip: string
}

interface PingResult {
  host: string
  name: string
  latency: number | null
  status: 'pending' | 'success' | 'error' | 'timeout'
  icon?: string
  isGlobal?: boolean
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
  { host: 'www.baidu.com', name: '百度', icon: '🔍', isGlobal: false },
  { host: 'www.qq.com', name: '腾讯', icon: '🐧', isGlobal: false },
  { host: 'www.taobao.com', name: '淘宝', icon: '🛒', isGlobal: false },
  { host: 'www.bilibili.com', name: 'B站', icon: '📺', isGlobal: false },
  { host: 'www.zhihu.com', name: '知乎', icon: '💬', isGlobal: false },
  { host: 'www.weibo.com', name: '微博', icon: '📱', isGlobal: false },
  { host: 'https://www.google.com', name: 'Google', icon: '🌐', isGlobal: true },
  { host: 'https://www.github.com', name: 'GitHub', icon: '💻', isGlobal: true },
  { host: 'https://www.youtube.com', name: 'YouTube', icon: '🎬', isGlobal: true },
  { host: 'https://www.twitter.com', name: 'Twitter', icon: '🐦', isGlobal: true },
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
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo[]>([])
  
  const [lanDevices, setLanDevices] = useState<Array<{ip: string, mac: string, type: string}>>([])
  const [isScanningLan, setIsScanningLan] = useState(false)
  const [scannedSubnet, setScannedSubnet] = useState<string>('')
  const [hasScanned, setHasScanned] = useState(false)

  const [pingResults, setPingResults] = useState<PingResult[]>(
    PING_TARGETS.map(t => ({ ...t, latency: null, status: 'pending' }))
  )
  const [isPinging, setIsPinging] = useState(false)

  const scanLanNetwork = useCallback(async (ipStr: string) => {
    // 增加容错：提取纯粹的 IPv4 格式
    const ipMatch = ipStr.match(/(\d+\.\d+\.\d+)\.\d+/)
    if (!ipMatch) {
      console.warn('Invalid IP format for LAN scan:', ipStr)
      return
    }
    const subnet = ipMatch[1] // 例如 "192.168.31"
    
    setIsScanningLan(true)
    setScannedSubnet(subnet)
    setHasScanned(true)
    setLanDevices([])
    try {
      const res = await window.electron.network.scanLan(subnet)
      if (res.success && res.devices) {
        setLanDevices(res.devices)
      } else {
        console.error('Scan LAN returned failure:', res.error)
      }
    } catch (e) {
      console.error('Failed to scan LAN:', e)
    } finally {
      setIsScanningLan(false)
    }
  }, [])

  const fetchNetworkInfo = useCallback(async () => {
    try {
      const res = await window.electron.network.getInfo()
      if (res.success && res.info) {
        setNetworkInfo(Array.isArray(res.info) ? res.info : [res.info])
      }
    } catch (e) {
      console.error('Failed to get network info:', e)
    }
  }, [])

  const webPing = async (url: string): Promise<number | null> => {
    const startTime = performance.now()
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      return Math.round(performance.now() - startTime)
    } catch (e) {
      return null
    }
  }

  const runPingTest = useCallback(async () => {
    setIsPinging(true)
    const initialResults = PING_TARGETS.map(t => ({ ...t, latency: null, status: 'pending' as const }))
    setPingResults(initialResults)
    
    const concurrency = 3
    const results = [...initialResults]
    
    for (let i = 0; i < PING_TARGETS.length; i += concurrency) {
      const batch = PING_TARGETS.slice(i, i + concurrency)
      await Promise.all(batch.map(async (target, batchIdx) => {
        const index = i + batchIdx
        if (index >= PING_TARGETS.length) return

        let latency: number | null = null
        let success = false

        if (target.isGlobal) {
          latency = await webPing(target.host)
          success = latency !== null
        } else {
          const res = await window.electron.network.ping(target.host)
          latency = res.latency
          success = res.success
        }

        results[index] = {
          ...target,
          latency,
          status: success ? 'success' : 'error'
        }
        setPingResults([...results])
      }))
    }
    
    setIsPinging(false)
  }, [])

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    
    fetchNetworkInfo()
    runPingTest() // 初始自动运行一次测速
    
    const timer = setInterval(fetchNetworkInfo, 10000)

    return () => {
      if (document.head.contains(styleSheet)) {
        document.head.removeChild(styleSheet)
      }
      clearInterval(timer)
    }
  }, [fetchNetworkInfo, runPingTest])

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
      <div className="radar-container mx-auto scale-110">
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
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="text-center mb-8 fade-in-up">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-white/10">
            <Server className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            网络监测雷达
          </h1>
        </div>
        <p className="text-muted-foreground">管理系统网络适配器、局域网设备与互联网连接质量</p>
      </div>

      {/* 多网卡信息滚动面板 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 fade-in-up overflow-x-auto pb-2" style={{ animationDelay: '0.1s' }}>
        {networkInfo.length === 0 ? (
           <div className="col-span-full py-12 text-center text-muted-foreground bg-white/10 rounded-2xl border border-white/10">
              正在扫描系统网络适配器...
           </div>
        ) : networkInfo.map((adapter, i) => (
          <div key={`${adapter.name}-${i}`} className="bg-white/40 dark:bg-black/20 border border-white/20 dark:border-white/10 rounded-2xl p-4 backdrop-blur-sm flex flex-col gap-3 transition-all hover:scale-[1.02] hover:bg-white/50 dark:hover:bg-black/30 group">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    adapter.description.toLowerCase().includes('tailscale') ? 'bg-orange-500/20 text-orange-500' :
                    adapter.type === 'Wi-Fi' ? 'bg-blue-500/20 text-blue-500' : 'bg-purple-500/20 text-purple-500'
                  }`}>
                    {adapter.description.toLowerCase().includes('tailscale') ? <Globe className="w-5 h-5" /> :
                     adapter.type === 'Wi-Fi' ? <Wifi className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-bold text-sm truncate" title={adapter.name}>{adapter.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate" title={adapter.description}>{adapter.description}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  <div className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 text-[10px] font-bold">已连接</div>
                  <button
                    onClick={() => scanLanNetwork(adapter.ip)}
                    disabled={isScanningLan}
                    className="text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 px-2 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    扫描此网段
                  </button>
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="bg-white/30 dark:bg-black/20 rounded-lg p-2">
                   <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                      <Zap className="w-3 h-3" /> 链路带宽
                   </div>
                   <div className="text-xs font-bold truncate">{adapter.speed}</div>
                </div>
                <div className="bg-white/30 dark:bg-black/20 rounded-lg p-2">
                   <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                      <ShieldCheck className="w-3 h-3" /> 内网 IP
                   </div>
                   <div className="text-xs font-bold truncate">{adapter.ip}</div>
                </div>
             </div>
          </div>
        ))}
      </div>

      {/* 局域网扫描结果面板 */}
      {hasScanned && (
        <div className="bg-white/30 dark:bg-black/10 border border-white/10 rounded-3xl p-8 backdrop-blur-xl fade-in-up mb-8" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Monitor className="w-5 h-5 text-blue-500" />
              局域网设备雷达
              {scannedSubnet && <span className="text-sm font-normal text-muted-foreground ml-2">({scannedSubnet}.x)</span>}
            </h2>
            {isScanningLan ? (
              <div className="flex items-center gap-2 text-blue-500 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                正在深度扫描...
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                共发现 <span className="text-blue-500 font-bold">{lanDevices.length}</span> 台活跃设备
              </div>
            )}
          </div>

          {!isScanningLan && lanDevices.length === 0 ? (
            <div className="text-center py-12 bg-black/5 dark:bg-white/5 rounded-2xl border border-dashed border-white/10 text-muted-foreground">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>该网段下暂未发现其他设备</p>
              <p className="text-xs mt-1 opacity-60">请确认这是一个真实的物理局域网</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lanDevices.map((device, idx) => (
                <div key={idx} className="bg-white/40 dark:bg-black/20 border border-white/20 dark:border-white/10 rounded-xl p-3 flex items-center justify-between hover:bg-white/60 dark:hover:bg-black/30 transition-all group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <div className="font-bold text-sm truncate" title={device.name}>{device.name || '未知设备'}</div>
                      <div className="flex flex-col text-[10px] text-muted-foreground font-mono">
                        <span>IP: {device.ip}</span>
                        <span className="uppercase">MAC: {device.mac}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] font-bold px-2 py-1 rounded-lg bg-green-500/10 text-green-600 shrink-0">
                    在线
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 连接质量探测面板 */}
      <div className="bg-white/30 dark:bg-black/10 border border-white/10 rounded-3xl p-8 backdrop-blur-xl fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">连接质量探测</h2>
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
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all duration-300 shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isPinging ? 'animate-spin' : ''}`} />
            {isPinging ? '雷达扫描中...' : '开始雷达扫描'}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-shrink-0">
                {renderRadar()}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-grow w-full">
              {pingResults.map((result, index) => (
                <div
                  key={result.host}
                  className="p-4 rounded-2xl bg-white/40 dark:bg-black/20 border border-white/20 dark:border-white/10 backdrop-blur-sm transition-all duration-300 hover:bg-white/60 dark:hover:bg-black/30 group"
                  style={{ animationDelay: `${0.2 + index * 0.05}s` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/50 dark:bg-black/20 flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">
                        {result.icon}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{result.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{result.host}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      {result.status === 'pending' && (
                        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin ml-auto" />
                      )}
                      {result.status === 'success' && (
                        <div className={`font-mono font-bold text-lg ${getLatencyColor(result.latency)}`}>
                          {result.latency}<span className="text-xs ml-0.5">ms</span>
                        </div>
                      )}
                      {result.status === 'error' && (
                        <div className="flex items-center gap-1 text-red-500 font-medium text-sm">
                          <XCircle className="w-4 h-4" />
                          <span>超时</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
        </div>
      </div>

    </div>
  )
}

export default NetworkRadarTool