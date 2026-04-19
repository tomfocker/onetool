import type { NetworkInterfaceInfo } from './types'

const PRIVATE_IPV4_RE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/
const LINK_LOCAL_IPV4_RE = /^169\.254\./
const VIRTUAL_INTERFACE_RE =
  /(virtualbox|vmware|hyper-v|vethernet|host-only|tailscale|loopback|docker|container|vpn|tap|tun)/i

const PUBLIC_PROBE_HOSTS = [
  { host: '223.5.5.5', name: '阿里云 DNS' },
  { host: '119.29.29.29', name: '腾讯 DNS' },
  { host: '180.76.76.76', name: '百度 DNS' },
  { host: '1.1.1.1', name: 'Cloudflare DNS' },
  { host: '8.8.8.8', name: 'Google DNS' }
]

export function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4_RE.test(ip)
}

export function isLinkLocalIpv4(ip: string): boolean {
  return LINK_LOCAL_IPV4_RE.test(ip)
}

export function isVirtualNetworkInterface(info: Pick<NetworkInterfaceInfo, 'name' | 'description'>): boolean {
  return VIRTUAL_INTERFACE_RE.test(`${info.name} ${info.description}`)
}

export function parsePingOutput(output: string): { alive: boolean; time: number | null } {
  if (!output.trim()) {
    return { alive: false, time: null }
  }

  const hasFullPacketLoss =
    /100%\s*(?:丢失|loss)/i.test(output) || /request timed out/i.test(output)
  const timeMatch = output.match(/(?:时间|time)\s*[=<]\s*(\d+)(?:ms)?/i)

  if (timeMatch && !hasFullPacketLoss) {
    const parsed = parseInt(timeMatch[1], 10)
    return { alive: true, time: Number.isNaN(parsed) ? null : parsed }
  }

  const hasReply = /(?:Reply from|来自 .* 的回复)/i.test(output)
  if (hasReply && !hasFullPacketLoss) {
    return { alive: true, time: null }
  }

  return { alive: false, time: null }
}

function scoreInterface(info: NetworkInterfaceInfo): number {
  let score = 0

  if (isPrivateIpv4(info.ip)) score += 40
  if (!isLinkLocalIpv4(info.ip)) score += 20
  if (!isVirtualNetworkInterface(info)) score += 35
  if (info.type === 'Wi-Fi' || info.type === '以太网') score += 5

  return score
}

export function pickPreferredLanInterface(
  interfaces: NetworkInterfaceInfo[]
): NetworkInterfaceInfo | null {
  if (interfaces.length === 0) {
    return null
  }

  return [...interfaces].sort((left, right) => scoreInterface(right) - scoreInterface(left))[0] ?? null
}

export function buildNetworkProbeHosts(
  interfaces: NetworkInterfaceInfo[]
): Array<{ host: string; name: string }> {
  const probes: Array<{ host: string; name: string }> = [{ host: '127.0.0.1', name: '本机回环' }]
  const preferred = pickPreferredLanInterface(interfaces)

  if (preferred && !isLinkLocalIpv4(preferred.ip) && preferred.ip !== '127.0.0.1') {
    probes.push({ host: preferred.ip, name: '当前网卡' })
  }

  for (const probe of PUBLIC_PROBE_HOSTS) {
    if (!probes.some((item) => item.host === probe.host)) {
      probes.push(probe)
    }
  }

  return probes
}

export function buildLatencyProbeHosts(): Array<{ host: string; name: string }> {
  return PUBLIC_PROBE_HOSTS.map((probe) => ({ ...probe }))
}

export function formatPingLatency(latency: number | null): string {
  return latency == null ? '超时' : `${latency}ms`
}
