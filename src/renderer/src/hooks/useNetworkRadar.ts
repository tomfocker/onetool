import { useState, useCallback, useEffect, useRef } from 'react'
import { NetworkInterfaceInfo as NetworkInfo, LanDevice } from '../../../shared/types'

export interface PingResult {
  host: string
  name: string
  latency: number | null
  status: 'pending' | 'success' | 'error' | 'timeout'
  icon?: string
  isGlobal?: boolean
}

export function useNetworkRadar() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo[]>([])
  const [pingResults, setPingResults] = useState<PingResult[]>([
    { host: 'www.baidu.com', name: '百度', latency: null, status: 'pending', isGlobal: true },
    { host: 'www.google.com', name: '谷歌', latency: null, status: 'pending', isGlobal: true },
    { host: '1.1.1.1', name: 'Cloudflare', latency: null, status: 'pending', isGlobal: true },
    { host: '114.114.114.114', name: '114 DNS', latency: null, status: 'pending', isGlobal: true }
  ])
  const [lanDevices, setLanDevices] = useState<LanDevice[]>([])
  const [isScanningLan, setIsScanningLan] = useState(false)
  const [isPinging, setIsPinging] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const webPing = async (url: string, signal: AbortSignal): Promise<number | null> => {
    const startTime = performance.now()
    const controller = new AbortController()
    
    // 级联信号
    signal.addEventListener('abort', () => controller.abort())
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    try {
      await fetch(`https://${url}/favicon.ico`, {
        method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: controller.signal
      })
      clearTimeout(timeoutId)
      return Math.round(performance.now() - startTime)
    } catch (e) {
      clearTimeout(timeoutId)
      return null
    }
  }

  const runPingTest = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsPinging(true)
    
    // 初始化结果状态，设为 pending
    setPingResults(prev => prev.map(r => ({ ...r, status: 'pending', latency: null })))

    // 预获取当前待测列表
    let currentTargets: PingResult[] = []
    setPingResults(prev => {
      currentTargets = [...prev]
      return prev
    })

    for (let i = 0; i < currentTargets.length; i++) {
      if (signal.aborted) break
      const target = currentTargets[i]
      let latency: number | null = null
      let success = false

      try {
        if (target.isGlobal) {
          latency = await webPing(target.host, signal)
          success = latency !== null
        } else {
          const res = await window.electron.network.ping(target.host)
          if (signal.aborted) break
          latency = res.data?.time || null
          success = res.data?.alive || false
        }
      } catch (e) { success = false }

      setPingResults(prev => {
        const next = [...prev]
        if (next[i]) {
          next[i] = { ...next[i], latency, status: success ? 'success' : 'error' }
        }
        return next
      })
    }
    if (!signal.aborted) setIsPinging(false)
  }, []) // 移除 pingResults 依赖项

  const fetchNetworkInfo = useCallback(async () => {
    try {
      const res = await window.electron.network.getInfo()
      if (res.success && res.data?.interfaces) {
        setNetworkInfo(Array.isArray(res.data.interfaces) ? res.data.interfaces : [res.data.interfaces])
      }
    } catch (e) { console.error('Failed to get network info:', e) }
  }, [])

  const scanLan = useCallback(async () => {
    if (networkInfo.length === 0) return
    const primaryIp = networkInfo[0].ip
    const subnet = primaryIp.split('.').slice(0, 3).join('.')
    
    setIsScanningLan(true)
    try {
      const res = await window.electron.network.scanLan(subnet)
      if (res.success && res.data?.devices) {
        setLanDevices(res.data.devices.map(d => ({ ...d, type: 'unknown' })))
      }
    } catch (e) { console.error('Failed to scan LAN:', e) }
    finally { setIsScanningLan(false) }
  }, [networkInfo])

  useEffect(() => {
    fetchNetworkInfo()
    runPingTest()
    const timer = setInterval(fetchNetworkInfo, 10000)
    return () => {
      clearInterval(timer)
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [fetchNetworkInfo, runPingTest])

  return {
    networkInfo,
    pingResults,
    lanDevices,
    isScanningLan,
    isPinging,
    runPingTest,
    scanLan,
    fetchNetworkInfo
  }
}
