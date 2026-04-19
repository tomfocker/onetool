import { useState, useCallback, useEffect, useRef } from 'react'
import { NetworkInterfaceInfo as NetworkInfo, LanDevice } from '../../../shared/types'
import { buildLatencyProbeHosts, mapLatencyProbeResults, pickPreferredLanInterface } from '../../../shared/networkRadar'

export interface PingResult {
  host: string
  name: string
  latency: number | null
  status: 'pending' | 'success' | 'error' | 'timeout'
}

function createPendingResults(): PingResult[] {
  return buildLatencyProbeHosts().map((item) => ({
    ...item,
    latency: null,
    status: 'pending'
  }))
}

export function useNetworkRadar() {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo[]>([])
  const [pingResults, setPingResults] = useState<PingResult[]>(createPendingResults())
  const [lanDevices, setLanDevices] = useState<LanDevice[]>([])
  const [isScanningLan, setIsScanningLan] = useState(false)
  const [isPinging, setIsPinging] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const runPingTest = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    const probeHosts = buildLatencyProbeHosts()

    setIsPinging(true)
    setPingResults(createPendingResults())

    try {
      const res = await window.electron.network.pingBatch(probeHosts.map((item) => item.host))
      console.log('[NetworkRadar] pingBatch response', { probeHosts, res })
      if (signal.aborted) return
      setPingResults(mapLatencyProbeResults(probeHosts, res))
    } catch {
      setPingResults(
        probeHosts.map((item) => ({ ...item, latency: null, status: 'error' as const }))
      )
    }

    if (!signal.aborted) {
      setIsPinging(false)
    }
  }, [])

  const fetchNetworkInfo = useCallback(async () => {
    try {
      const res = await window.electron.network.getInfo()
      if (res.success && res.data?.interfaces) {
        const interfaces = Array.isArray(res.data.interfaces) ? res.data.interfaces : [res.data.interfaces]
        setNetworkInfo(interfaces)
        return interfaces
      }
    } catch (e) { console.error('Failed to get network info:', e) }
    return []
  }, [])

  const scanLan = useCallback(async () => {
    const activeInterface = pickPreferredLanInterface(networkInfo)
    if (!activeInterface) return
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
    let disposed = false

    const initialize = async () => {
      await fetchNetworkInfo()
      if (!disposed) runPingTest()
    }

    initialize()
    const timer = setInterval(fetchNetworkInfo, 10000)
    return () => {
      disposed = true
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
