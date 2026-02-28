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

    // Set all to pending upfront.
    setPingResults(
      DEFAULT_HOSTS.map(h => ({ ...h, latency: null, status: 'pending' }))
    )

    const pingOne = async (target: { host: string; name: string }, index: number) => {
      let latency: number | null = null
      let success = false
      try {
        const res = await Promise.race([
          window.electron.network.ping(target.host),
          new Promise<any>(resolve => setTimeout(() => resolve({ success: true, data: { alive: false, time: null } }), 10000))
        ])
        if (signal.aborted) return
        latency = res.data?.time ?? null
        success = res.data?.alive || false
      } catch {
        success = false
      }
      if (signal.aborted) return
      setPingResults(prev => {
        const next = [...prev]
        if (next[index]) next[index] = { ...next[index], latency, status: success ? 'success' : 'error' }
        return next
      })
    }

    // 减少并发数，避免同时过多 ping 进程抢占系统资源
    const CONCURRENCY = 2
    for (let i = 0; i < DEFAULT_HOSTS.length; i += CONCURRENCY) {
      if (signal.aborted) break
      const batch = DEFAULT_HOSTS.slice(i, i + CONCURRENCY).map((t, j) => pingOne(t, i + j))
      await Promise.all(batch)
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
