import type { WslDistroInfo, WslVersionInfo } from '../../shared/types'

export interface ParsedWslList {
  defaultDistro: string | null
  distros: WslDistroInfo[]
}

function normalizeCapturedText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function decodeWslText(source: Buffer | string): string {
  if (typeof source === 'string') {
    return normalizeCapturedText(source)
  }

  const nullByteCount = source.reduce((count, value) => count + (value === 0 ? 1 : 0), 0)
  const useUtf16 = nullByteCount > 0 && nullByteCount >= Math.floor(source.length / 4)
  const decoded = source.toString(useUtf16 ? 'utf16le' : 'utf8')

  return normalizeCapturedText(decoded)
}

export function parseWslListVerbose(raw: string): ParsedWslList {
  const distros: WslDistroInfo[] = []
  let defaultDistro: string | null = null

  for (const line of decodeWslText(raw).split('\n')) {
    const normalized = line.trim()
    if (!normalized) continue
    if (/^(NAME|名称)\s+/i.test(normalized)) continue
    if (/^(Windows Subsystem for Linux|适用于 Linux 的 Windows 子系统)/i.test(normalized)) continue
    if (/^(The Windows Subsystem for Linux has no installed distributions|没有已安装的 Linux 分发版|没有已安装的发行版)/i.test(normalized)) {
      continue
    }

    const match = line.match(/^\s*(\*?)\s*(.*?)\s{2,}(.*?)\s{2,}(\d+)\s*$/)
    if (!match) {
      continue
    }

    const distro: WslDistroInfo = {
      name: match[2].trim(),
      state: match[3].trim(),
      version: Number.parseInt(match[4], 10),
      isDefault: match[1] === '*',
      isRunning: /Running|运行/i.test(match[3].trim())
    }

    if (distro.isDefault) {
      defaultDistro = distro.name
    }

    distros.push(distro)
  }

  return { defaultDistro, distros }
}

const VERSION_LINE_PATTERNS: Array<[keyof WslVersionInfo, RegExp]> = [
  ['wslVersion', /^(?:WSL(?:\s+version)?|WSL 版本)\s*:\s*(.+)$/i],
  ['kernelVersion', /^(?:Kernel version|内核版本)\s*:\s*(.+)$/i],
  ['wslgVersion', /^(?:WSLg(?:\s+version)?|WSLg 版本)\s*:\s*(.+)$/i],
  ['msrdcVersion', /^(?:MSRDC(?:\s+version)?|MSRDC 版本)\s*:\s*(.+)$/i],
  ['direct3dVersion', /^(?:Direct3D(?:\s+version)?|Direct3D 版本)\s*:\s*(.+)$/i],
  ['dxcoreVersion', /^(?:DXCore(?:\s+version)?|DXCore 版本)\s*:\s*(.+)$/i],
  ['windowsVersion', /^(?:Windows(?:\s+version)?|Windows 版本)\s*:\s*(.+)$/i]
]

export function parseWslVersionInfo(raw: string): WslVersionInfo {
  const info: WslVersionInfo = {
    wslVersion: null,
    kernelVersion: null,
    wslgVersion: null,
    msrdcVersion: null,
    direct3dVersion: null,
    dxcoreVersion: null,
    windowsVersion: null
  }

  for (const line of decodeWslText(raw).split('\n')) {
    const normalized = line.trim()
    if (!normalized) continue

    for (const [key, pattern] of VERSION_LINE_PATTERNS) {
      const match = normalized.match(pattern)
      if (match?.[1]) {
        info[key] = match[1].trim()
      }
    }
  }

  return info
}
