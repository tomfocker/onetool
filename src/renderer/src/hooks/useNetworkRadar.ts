import { useState, useCallback, useEffect, useRef } from 'react'
import { NetworkInterfaceInfo as NetworkInfo, LanDevice } from '../../../shared/types'

export interface PingResult {
  host: string
  name: string
  latency: number | null
  status: 'pending' | 'success' | 'error' | 'timeout'
}

const DEFAULT_HOSTS = [
  { host: 'www.baidu.com', name: '百度搜索' },
  { host: 'www.qq.com', name: '腾讯网' },
  { host: 'www.taobao.com', name: '淘宝网' },
  { host: 'www.bilibili.com', name: '哔哩哔哩' },
  { host: 'github.com', name: 'GitHub' },
  { host: 'www.microsoft.com', name: '微软' },
  { host: 'www.apple.com.cn', name: '苹果(中国)' },
  { host: '114.114.114.114', name: '114 DNS' },
  { host: '223.5.5.5', name: '阿里云 DNS' },
  { host: '8.8.8.8', name: 'Google DNS' }
]

export function useNetworkRadar() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo[]>([])
  const [pingResults, setPingResults] = useState<PingResult[]>(
    DEFAULT_HOSTS.map(h => ({ ...h, latency: null, status: 'pending' }))
  )
  const [lanDevices, setLanDevices] = useState<LanDevice[]>([])
  const [isScanningLan, setIsScanningLan] = useState(false)
  const [isPinging, setIsPinging] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const runPingTest = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsPinging(true)
    setPingResults(
      DEFAULT_HOSTS.map(h => ({ ...h, latency: null, status: 'pending' }))
    )

    try {
      const res = await window.electron.network.pingBatch(DEFAULT_HOSTS.map(h => h.host))
      if (signal.aborted) return
      if (res.success && Array.isArray(res.data)) {
        // 根据 host 顺序映射结果
        const resultMap = new Map<string, { alive: boolean; time: number | null }>()
        for (const r of res.data) {
          resultMap.set(r.host, { alive: r.alive, time: r.time })
        }
        setPingResults(
          DEFAULT_HOSTS.map(h => {
            const r = resultMap.get(h.host)
            if (!r) return { ...h, latency: null, status: 'error' as const }
            return { ...h, latency: r.time, status: r.alive ? 'success' as const : 'error' as const }
          })
        )
      }
    } catch {
      // 静默失败，保持 pending 状态
    }

    if (!signal.aborted) {
      setIsPinging(false)
    }
  }, [])

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
    // Prefer true private subnets over tailscale/VPNs
    const activeInterface = networkInfo.find(i => /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(i.ip)) || networkInfo[0]
    const primaryIp = activeInterface.ip
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
