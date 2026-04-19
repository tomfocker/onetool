import type { SystemConfig, WslOverview } from './types'

type MaybeSystemConfig = Partial<SystemConfig> | null | undefined
type WslOverviewLike = Pick<WslOverview, 'available'> | null | undefined
type PingResultLike = { status: 'pending' | 'success' | 'error' | 'timeout' }

const PLACEHOLDER_HARDWARE_VALUES = new Set([
  '',
  'Unknown',
  'Unknown Processor',
  'Unknown hardware',
  'Unknown Motherboard',
  'Unknown GPU',
  'Unknown Storage'
])

function isMeaningfulHardwareValue(value: string | null | undefined): boolean {
  const normalized = String(value || '').trim()
  return normalized !== '' && !PLACEHOLDER_HARDWARE_VALUES.has(normalized)
}

export function hasMeaningfulSystemConfig(config: MaybeSystemConfig): boolean {
  if (!config) {
    return false
  }

  return [
    config.cpu,
    config.deviceModel,
    config.motherboard,
    config.memory,
    config.gpu,
    config.disk
  ].some((value) => isMeaningfulHardwareValue(value))
}

export function getWslOverviewPhase(
  overview: WslOverviewLike,
  hasLoadedOnce: boolean
): 'loading' | 'ready' | 'missing' {
  if (!hasLoadedOnce) {
    return 'loading'
  }

  return overview?.available ? 'ready' : 'missing'
}

export function areAllPingResultsPending(results: PingResultLike[]): boolean {
  return results.length > 0 && results.every((result) => result.status === 'pending')
}
