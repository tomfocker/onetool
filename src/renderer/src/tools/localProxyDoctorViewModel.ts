import type {
  ProxyDoctorApplyRequest,
  ProxyDoctorLayerState,
  ProxyDoctorLayerStatus,
  ProxyDoctorSummary
} from '../../../shared/proxyDoctor'

export const DEFAULT_PROXY_DOCTOR_TARGET = '127.0.0.1:7897'

export const DEFAULT_PROXY_DOCTOR_BYPASS = [
  'localhost',
  '127.*',
  '192.168.*',
  '10.*',
  '172.16.*',
  '172.17.*',
  '172.18.*',
  '172.19.*',
  '172.20.*',
  '172.21.*',
  '172.22.*',
  '172.23.*',
  '172.24.*',
  '172.25.*',
  '172.26.*',
  '172.27.*',
  '172.28.*',
  '172.29.*',
  '172.30.*',
  '172.31.*',
  '<local>'
]

export function splitProxyDoctorBypass(value: string): string[] {
  return value
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function createProxyDoctorApplyRequest(target: string, bypass: string): ProxyDoctorApplyRequest {
  return {
    target: target.trim(),
    bypass: splitProxyDoctorBypass(bypass)
  }
}

export function getFirstProxyTargetCandidate(value: string): string | null {
  const normalized = value.trim()
  if (!normalized || normalized === '未设置') {
    return null
  }

  const urlMatch = normalized.match(/\b(?:https?|socks5):\/\/(?:\[[0-9a-f:.]+\]|[a-z0-9._-]+):\d{1,5}\b/i)
  if (urlMatch) {
    return urlMatch[0]
  }

  const hostPortMatch = normalized.match(/(?:^|[=;\s])((?:\[[0-9a-f:.]+\]|[a-z0-9._-]+):\d{1,5})(?=$|[;\s,])/i)
  return hostPortMatch?.[1] || null
}

export function getSummaryCopy(summary: ProxyDoctorSummary) {
  if (summary === 'unified') {
    return {
      title: '开发代理已统一',
      description: '系统代理、命令行、Git 和 npm 都指向目标代理。'
    }
  }
  if (summary === 'off') {
    return {
      title: '开发代理未启用',
      description: '核心代理层当前没有显式代理配置。'
    }
  }
  if (summary === 'conflict') {
    return {
      title: '代理配置存在冲突',
      description: '至少一个代理层和目标代理不一致。'
    }
  }
  return {
    title: '无法完成诊断',
    description: '部分系统命令返回错误，请查看高级日志。'
  }
}

export function getLayerStateTone(state: ProxyDoctorLayerState): 'success' | 'muted' | 'warning' | 'danger' {
  if (state === 'ok') return 'success'
  if (state === 'off' || state === 'unavailable') return 'muted'
  if (state === 'conflict') return 'warning'
  return 'danger'
}

export function getLayerStateLabel(state: ProxyDoctorLayerState): string {
  if (state === 'ok') return '正常'
  if (state === 'off') return '未设置'
  if (state === 'conflict') return '冲突'
  if (state === 'unavailable') return '不可用'
  return '错误'
}

export interface ProxyDoctorLayerLampCopy {
  tone: 'success' | 'muted' | 'warning' | 'danger'
  stateLabel: string
  reachabilityLabel: string
}

export function getLayerLampCopy(layer: ProxyDoctorLayerStatus, portOpen?: boolean): ProxyDoctorLayerLampCopy {
  if (layer.state === 'ok') {
    return {
      tone: portOpen === false ? 'warning' : 'success',
      stateLabel: '已开启',
      reachabilityLabel: portOpen === false ? '端口未通' : '可联通'
    }
  }

  if (layer.state === 'off') {
    return {
      tone: 'muted',
      stateLabel: '未开启',
      reachabilityLabel: '未使用'
    }
  }

  if (layer.state === 'conflict') {
    return {
      tone: 'warning',
      stateLabel: '配置不一致',
      reachabilityLabel: portOpen === false ? '目标未通' : '目标可通'
    }
  }

  if (layer.state === 'unavailable') {
    return {
      tone: 'muted',
      stateLabel: '不可用',
      reachabilityLabel: '跳过'
    }
  }

  return {
    tone: 'danger',
    stateLabel: '读取失败',
    reachabilityLabel: '无法判断'
  }
}
