export type ProxyDoctorProtocol = 'http' | 'https' | 'socks5'
export type ProxyDoctorLayerId = 'wininet' | 'winhttp' | 'env' | 'git' | 'npm' | 'process' | 'codex'
export type ProxyDoctorLayerState = 'ok' | 'off' | 'conflict' | 'unavailable' | 'error'
export type ProxyDoctorSummary = 'unified' | 'off' | 'conflict' | 'error'

export interface ProxyDoctorTarget {
  input: string
  protocol: ProxyDoctorProtocol
  host: string
  port: number
  url: string
  winInetServer: string
  envValue: string
}

export interface ProxyDoctorLayerStatus {
  id: ProxyDoctorLayerId
  state: ProxyDoctorLayerState
  title: string
  currentValue: string
  detail: string
  actionHint: string
  canFix: boolean
  canClear: boolean
}

export interface ProxyDoctorSnapshot {
  target: ProxyDoctorTarget
  summary: ProxyDoctorSummary
  portOpen: boolean
  generatedAt: string
  layers: ProxyDoctorLayerStatus[]
  log: string[]
  reportText: string
}

export interface ProxyDoctorApplyRequest {
  target: string
  bypass: string[]
}

export interface ProxyDoctorLayerDefinition {
  id: ProxyDoctorLayerId
  title: string
  description: string
  actionHint: string
  canFix: boolean
  canClear: boolean
}

export const PROXY_DOCTOR_PROXY_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy'
] as const
export const PROXY_DOCTOR_NO_PROXY_KEYS = ['NO_PROXY', 'no_proxy'] as const
export const PROXY_DOCTOR_DEFAULT_NO_PROXY = 'localhost,127.0.0.1,::1'

export const PROXY_DOCTOR_LAYER_DEFINITIONS: ProxyDoctorLayerDefinition[] = [
  {
    id: 'wininet',
    title: 'Windows 系统代理',
    description: '检查 Windows 设置中的用户级系统代理。',
    actionHint: '设置为目标代理，供浏览器和多数桌面应用使用。',
    canFix: true,
    canClear: true
  },
  {
    id: 'winhttp',
    title: 'WinHTTP 代理',
    description: '检查 WinHTTP 服务代理配置。',
    actionHint: '同步为目标代理，供系统服务和部分命令行工具使用。',
    canFix: true,
    canClear: true
  },
  {
    id: 'env',
    title: '命令行环境变量',
    description: '检查 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY 和 NO_PROXY。',
    actionHint: '写入目标代理环境变量并保留默认本地直连规则。',
    canFix: true,
    canClear: true
  },
  {
    id: 'git',
    title: 'Git 代理',
    description: '检查 Git 全局 http.proxy 与 https.proxy。',
    actionHint: '将 Git 全局代理设置为目标代理。',
    canFix: true,
    canClear: true
  },
  {
    id: 'npm',
    title: 'npm 代理',
    description: '检查 npm proxy 与 https-proxy 配置。',
    actionHint: '将 npm 代理设置为目标代理。',
    canFix: true,
    canClear: true
  },
  {
    id: 'process',
    title: '当前进程',
    description: '检查 OneTool 当前进程可见的代理环境。',
    actionHint: '重启 OneTool 或刷新进程环境后生效。',
    canFix: false,
    canClear: false
  },
  {
    id: 'codex',
    title: 'Codex 进程',
    description: '检查 Codex 相关进程继承到的代理环境。',
    actionHint: '重启 Codex 相关进程以继承新的代理设置。',
    canFix: false,
    canClear: false
  }
]

const SUPPORTED_PROTOCOLS: ProxyDoctorProtocol[] = ['http', 'https', 'socks5']
const CORE_LAYER_IDS: ProxyDoctorLayerId[] = ['wininet', 'winhttp', 'env', 'git', 'npm']

const SUMMARY_LABELS: Record<ProxyDoctorSummary, string> = {
  unified: '开发代理已统一',
  off: '开发代理未启用',
  conflict: '代理配置存在冲突',
  error: '无法完成诊断'
}

const LAYER_STATE_LABELS: Record<ProxyDoctorLayerState, string> = {
  ok: '正常',
  off: '未启用',
  conflict: '冲突',
  unavailable: '不可用',
  error: '错误'
}

function assertValidPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('代理端口必须在 1-65535 之间')
  }
}

function readAuthorityPort(source: string): number | null {
  const authority = source.slice(source.indexOf('://') + 3).split(/[/?#]/, 1)[0] ?? ''
  const match = authority.match(/:(\d+)$/)
  if (!match) {
    return null
  }

  return Number(match[1])
}

function assertSafeProxyHost(host: string): void {
  const isBracketedIpv6 = /^\[[0-9a-f:.]+\]$/i.test(host)
  const isDnsOrIpv4Host = /^[a-z0-9._-]+$/i.test(host)

  if (!host || (!isBracketedIpv6 && !isDnsOrIpv4Host)) {
    throw new Error('代理主机名包含不安全字符')
  }
}

export function normalizeProxyDoctorTarget(input: string): ProxyDoctorTarget {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('代理地址不能为空')
  }

  if (/^\d+$/.test(trimmed)) {
    const port = Number(trimmed)
    assertValidPort(port)
    const url = `http://127.0.0.1:${port}`

    return {
      input: trimmed,
      protocol: 'http',
      host: '127.0.0.1',
      port,
      url,
      winInetServer: `http=127.0.0.1:${port};https=127.0.0.1:${port}`,
      envValue: url
    }
  }

  const schemeMatch = trimmed.match(/^([a-z][a-z\d+.-]*):\/\//i)
  if (schemeMatch) {
    const protocol = schemeMatch[1].toLowerCase()
    if (!SUPPORTED_PROTOCOLS.includes(protocol as ProxyDoctorProtocol)) {
      throw new Error('不支持的代理协议')
    }
  }

  const source = schemeMatch ? trimmed : `http://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(source)
  } catch {
    throw new Error('代理端口必须在 1-65535 之间')
  }

  const protocol = parsed.protocol.slice(0, -1).toLowerCase() as ProxyDoctorProtocol
  if (!SUPPORTED_PROTOCOLS.includes(protocol)) {
    throw new Error('不支持的代理协议')
  }

  const explicitPort = readAuthorityPort(source)
  if (explicitPort == null) {
    throw new Error('代理端口必须在 1-65535 之间')
  }

  assertValidPort(explicitPort)

  const host = parsed.hostname
  assertSafeProxyHost(host)

  const url = `${protocol}://${host}:${explicitPort}`
  const server = `${host}:${explicitPort}`

  return {
    input: trimmed,
    protocol,
    host,
    port: explicitPort,
    url,
    winInetServer: protocol === 'socks5' ? `socks=${server}` : `http=${server};https=${server}`,
    envValue: url
  }
}

export function summarizeProxyDoctorLayers(layers: ProxyDoctorLayerStatus[]): ProxyDoctorSummary {
  const coreLayers = layers
    .filter((layer) => CORE_LAYER_IDS.includes(layer.id))
  const coreStates = coreLayers.map((layer) => layer.state)

  if (coreStates.some((state) => state === 'error')) {
    return 'error'
  }

  if (coreStates.some((state) => state === 'conflict')) {
    return 'conflict'
  }

  const coreIds = new Set(coreLayers.map((layer) => layer.id))
  const hasAllCoreLayers = CORE_LAYER_IDS.every((id) => coreIds.has(id))
  if (!hasAllCoreLayers) {
    return 'conflict'
  }

  if (coreStates.every((state) => state === 'ok' || state === 'unavailable')) {
    return 'unified'
  }

  if (coreStates.every((state) => state === 'off' || state === 'unavailable')) {
    return 'off'
  }

  return 'conflict'
}

export function getProxyDoctorSummaryLabel(summary: ProxyDoctorSummary): string {
  return SUMMARY_LABELS[summary]
}

export function buildProxyDoctorReport(input: Omit<ProxyDoctorSnapshot, 'reportText'>): string {
  const lines = [
    'OneTool 代理医生诊断报告',
    `生成时间: ${input.generatedAt}`,
    `目标代理: ${input.target.url}`,
    `诊断结果: ${getProxyDoctorSummaryLabel(input.summary)}`,
    `端口状态: ${input.portOpen ? '已开放' : '未开放'}`,
    '',
    '诊断层:'
  ]

  for (const layer of input.layers) {
    lines.push(`- ${layer.title}`)
    lines.push(`  状态: ${LAYER_STATE_LABELS[layer.state]}`)
    lines.push(`  当前值: ${layer.currentValue || '未设置'}`)
    lines.push(`  详情: ${layer.detail || '无'}`)
    lines.push(`  建议: ${layer.actionHint || '无'}`)
  }

  if (input.log.length > 0) {
    lines.push('', '日志:')
    for (const item of input.log) {
      lines.push(`- ${item}`)
    }
  }

  return lines.join('\n')
}
