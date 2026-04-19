# Hardware Model Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline whole-device model detection, shared hardware normalization rules, and a new `设备型号` card so mainstream Windows PCs display clean model names in the configuration checker.

**Architecture:** Keep raw hardware collection in `SystemService` PowerShell, then normalize candidate values in TypeScript through a new shared `hardwareIdentity` module. Extend `SystemConfig` with `deviceModel`, route normalized values through the existing `get-system-config` IPC, and keep the renderer focused on presentation and export formatting.

**Tech Stack:** TypeScript, Electron main/preload/renderer, PowerShell CIM/WMI queries, Node `node:test`, existing `npm run typecheck` scripts

---

## File Structure

- Create: `src/shared/hardwareIdentity.ts`
  Owns manufacturer aliases, blocked placeholder values, device-model candidate selection, monitor name cleanup, and renderer-safe label translation helpers.
- Create: `src/shared/hardwareIdentity.test.cjs`
  Covers normalization behavior with Node's built-in test runner.
- Modify: `src/shared/types.ts`
  Extends `SystemConfig` with the new `deviceModel` field.
- Modify: `src/main/services/SystemService.ts`
  Collects whole-device WMI sources, calls shared normalization helpers, and returns normalized `SystemConfig`.
- Modify: `src/renderer/src/components/ConfigChecker.tsx`
  Adds the `设备型号` card, imports the shared `SystemConfig` type and display helpers, upgrades the cache key, and updates report output order.

### Task 1: Build Shared Hardware Identity Rules

**Files:**
- Create: `src/shared/hardwareIdentity.ts`
- Test: `src/shared/hardwareIdentity.test.cjs`

- [ ] **Step 1: Write the failing normalization tests**

Create `src/shared/hardwareIdentity.test.cjs` with these test cases:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isPlaceholderHardwareValue,
  normalizeCompositeHardwareName,
  normalizeMonitorEntry,
  pickBestDeviceModel,
  translateHardwareLabel
} = require('./hardwareIdentity.ts')

test('normalizeCompositeHardwareName removes placeholder manufacturer values', () => {
  assert.equal(
    normalizeCompositeHardwareName('To Be Filled By O.E.M.', 'ROG Strix G614J', 'Unknown Motherboard'),
    'ROG Strix G614J'
  )
})

test('pickBestDeviceModel prefers Win32_ComputerSystemProduct over weaker fallbacks', () => {
  assert.equal(
    pickBestDeviceModel(
      [
        { manufacturer: 'LENOVO', model: 'Legion R7000P 2024', version: 'Default string' },
        { manufacturer: 'LENOVO', model: '82Y9', version: '' },
        { manufacturer: 'LENOVO', model: 'LNVNB161216', version: '' }
      ],
      'LENOVO LNVNB161216',
      '未识别具体型号'
    ),
    'Lenovo Legion R7000P 2024'
  )
})

test('pickBestDeviceModel falls back to motherboard when all device candidates are garbage', () => {
  assert.equal(
    pickBestDeviceModel(
      [
        { manufacturer: 'System manufacturer', model: 'System Product Name', version: 'System Version' },
        { manufacturer: 'To Be Filled By O.E.M.', model: 'Default string', version: '' }
      ],
      'ASUS PRIME B760M-A WIFI',
      '未识别具体型号'
    ),
    'ASUS PRIME B760M-A WIFI'
  )
})

test('normalizeMonitorEntry removes duplicate manufacturer prefixes and preserves resolution', () => {
  assert.equal(
    normalizeMonitorEntry('AOC', 'AOC 24G2W1G4', '1920x1080'),
    'AOC|AOC 24G2W1G4|1920x1080'
  )
})

test('translateHardwareLabel exposes localized display names for known brands', () => {
  assert.match(
    translateHardwareLabel('Lenovo Legion R7000P 2024'),
    /联想/
  )
})

test('isPlaceholderHardwareValue rejects firmware filler strings', () => {
  assert.equal(isPlaceholderHardwareValue('System Product Name'), true)
  assert.equal(isPlaceholderHardwareValue('Dell Latitude 7420'), false)
})
```

- [ ] **Step 2: Run the new test file and verify it fails**

Run: `node --test src/shared/hardwareIdentity.test.cjs`

Expected: FAIL with an error such as `Cannot find module './hardwareIdentity.ts'`.

- [ ] **Step 3: Write the shared normalization module**

Create `src/shared/hardwareIdentity.ts` with this implementation:

```ts
export interface DeviceModelCandidate {
  manufacturer?: string | null
  model?: string | null
  version?: string | null
}

const manufacturerAliases: Record<string, string> = {
  LENOVO: 'Lenovo',
  THINKPAD: 'ThinkPad',
  ASUSTEK: 'ASUS',
  ASUS: 'ASUS',
  'DELL INC.': 'Dell',
  DELL: 'Dell',
  'HEWLETT-PACKARD': 'HP',
  HP: 'HP',
  HPI: 'HP',
  'MICRO-STAR INTERNATIONAL CO., LTD.': 'MSI',
  'MICRO-STAR': 'MSI',
  MSI: 'MSI',
  ACER: 'Acer',
  MICROSOFT: 'Microsoft',
  HUAWEI: 'Huawei',
  HONOR: 'HONOR',
  XIAOMI: 'Xiaomi',
  REDMI: 'Redmi',
  COLORFUL: 'Colorful',
  THUNDEROBOT: 'Thunderobot',
  MECHREVO: 'Mechrevo',
  MACHENIKE: 'Machenike',
  HASEE: 'Hasee',
  SAMSUNG: 'Samsung',
  INTEL: 'Intel',
  NVIDIA: 'NVIDIA',
  AMD: 'AMD',
  KINGSTON: 'Kingston',
  MICRON: 'Micron',
  HYNIX: 'Hynix',
  'SK HYNIX': 'Hynix',
  'WESTERN DIGITAL': 'Western Digital',
  SEAGATE: 'Seagate',
  CRUCIAL: 'Crucial',
  AOC: 'AOC',
  TPV: 'AOC',
  PHILIPS: 'Philips',
  LG: 'LG',
  BENQ: 'BenQ',
  VIEWSONIC: 'ViewSonic'
}

const brandDisplayNames: Record<string, string> = {
  Lenovo: '联想 (Lenovo)',
  ASUS: '华硕 (ASUS)',
  Dell: '戴尔 (Dell)',
  HP: '惠普 (HP)',
  Acer: '宏碁 (Acer)',
  MSI: '微星 (MSI)',
  Microsoft: '微软 (Microsoft)',
  Huawei: '华为 (Huawei)',
  HONOR: '荣耀 (HONOR)',
  Xiaomi: '小米 (Xiaomi)',
  Redmi: '红米 (Redmi)',
  Thunderobot: '雷神 (Thunderobot)',
  Mechrevo: '机械革命 (Mechrevo)',
  Machenike: '机械师 (Machenike)',
  Hasee: '神舟 (Hasee)',
  Intel: '英特尔 (Intel)',
  NVIDIA: '英伟达 (NVIDIA)',
  Samsung: '三星 (Samsung)',
  Kingston: '金士顿 (Kingston)',
  Micron: '美光 (Micron)',
  Hynix: '海力士 (SK hynix)',
  'Western Digital': '西部数据 (WD)',
  Seagate: '希捷 (Seagate)',
  Crucial: '英睿达 (Crucial)',
  AOC: '冠捷 (AOC)',
  Philips: '飞利浦 (Philips)',
  BenQ: '明基 (BenQ)',
  ViewSonic: '优派 (ViewSonic)'
}

const placeholderValues = new Set([
  '',
  'TO BE FILLED BY O.E.M.',
  'TO BE FILLED BY O E M',
  'SYSTEM PRODUCT NAME',
  'SYSTEM VERSION',
  'SYSTEM MANUFACTURER',
  'DEFAULT STRING',
  'NOT APPLICABLE',
  'NOT AVAILABLE',
  'INVALID',
  'UNDEFINED',
  'UNKNOWN',
  'N/A',
  'OEM'
])

export function sanitizeHardwareText(value?: string | null): string {
  return (value ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isPlaceholderHardwareValue(value?: string | null): boolean {
  const cleaned = sanitizeHardwareText(value)
  if (!cleaned) return true
  if (/^[^A-Za-z0-9\u4e00-\u9fa5]+$/.test(cleaned)) return true
  const upper = cleaned.toUpperCase()
  return placeholderValues.has(upper)
}

export function normalizeManufacturerName(value?: string | null): string {
  const cleaned = sanitizeHardwareText(value)
  if (isPlaceholderHardwareValue(cleaned)) return ''
  return manufacturerAliases[cleaned.toUpperCase()] ?? cleaned
}

function dedupeManufacturerPrefix(manufacturer: string, model: string): string {
  if (!manufacturer || !model) return model
  const escaped = manufacturer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return model.replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim()
}

export function normalizeCompositeHardwareName(
  manufacturer?: string | null,
  model?: string | null,
  fallback = ''
): string {
  const normalizedManufacturer = normalizeManufacturerName(manufacturer)
  const cleanedModel = sanitizeHardwareText(model)
  const normalizedModel = isPlaceholderHardwareValue(cleanedModel) ? '' : cleanedModel
  if (!normalizedManufacturer && !normalizedModel) return fallback
  if (!normalizedManufacturer) return normalizedModel || fallback
  if (!normalizedModel) return normalizedManufacturer || fallback
  return `${normalizedManufacturer} ${dedupeManufacturerPrefix(normalizedManufacturer, normalizedModel)}`.trim()
}

export function pickBestDeviceModel(
  candidates: DeviceModelCandidate[],
  motherboardFallback: string,
  unknownLabel = '未识别具体型号'
): string {
  for (const candidate of candidates) {
    const base = normalizeCompositeHardwareName(candidate.manufacturer, candidate.model)
    const version = sanitizeHardwareText(candidate.version)
    const versionPart = isPlaceholderHardwareValue(version) ? '' : version
    const combined = [base, versionPart].filter(Boolean).join(' ').trim()
    if (combined) {
      return combined
    }
  }

  return motherboardFallback || unknownLabel
}

export function normalizeMonitorEntry(
  manufacturer?: string | null,
  name?: string | null,
  resolution?: string | null
): string {
  const normalizedManufacturer = normalizeManufacturerName(manufacturer) || 'Unknown'
  const cleanedName = sanitizeHardwareText(name)
  const normalizedName = isPlaceholderHardwareValue(cleanedName)
    ? ''
    : dedupeManufacturerPrefix(normalizedManufacturer, cleanedName)
  const cleanedResolution = sanitizeHardwareText(resolution)
  const normalizedResolution =
    cleanedResolution && !/^0[x×]/i.test(cleanedResolution) ? cleanedResolution : ''

  return [normalizedManufacturer, normalizedName, normalizedResolution].join('|')
}

export function translateHardwareLabel(value?: string | null): string {
  let result = sanitizeHardwareText(value)
  if (!result) return ''

  for (const [canonical, display] of Object.entries(brandDisplayNames)) {
    const escaped = canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(^|\\s|\\()${escaped}`, 'gi'), (match) => {
      if (match.startsWith('(')) return `(${display}`
      if (match.startsWith(' ')) return ` ${display}`
      return display
    })
  }

  return result
}
```

- [ ] **Step 4: Run the shared normalization tests and verify they pass**

Run: `node --test src/shared/hardwareIdentity.test.cjs`

Expected: PASS with 6 passing tests and no module resolution errors.

- [ ] **Step 5: Commit the shared module and tests**

```bash
git add src/shared/hardwareIdentity.ts src/shared/hardwareIdentity.test.cjs
git commit -m "feat: add hardware identity normalization helpers"
```

### Task 2: Extend the Hardware Snapshot Contract and Backend Assembly

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/SystemService.ts`
- Test: `src/shared/hardwareIdentity.test.cjs`

- [ ] **Step 1: Write failing tests that lock in whole-device selection behavior**

Append these tests to `src/shared/hardwareIdentity.test.cjs`:

```js
test('pickBestDeviceModel appends a useful version when firmware exposes it', () => {
  assert.equal(
    pickBestDeviceModel(
      [
        { manufacturer: 'Dell Inc.', model: 'Latitude 7420', version: '1.18.0' }
      ],
      'Dell 0XYZ',
      '未识别具体型号'
    ),
    'Dell Latitude 7420 1.18.0'
  )
})

test('normalizeCompositeHardwareName keeps a real motherboard model when manufacturer is blank', () => {
  assert.equal(
    normalizeCompositeHardwareName('', 'B760M MORTAR MAX WIFI', 'Unknown Motherboard'),
    'B760M MORTAR MAX WIFI'
  )
})
```

- [ ] **Step 2: Run the test file to verify the new cases fail before backend changes**

Run: `node --test src/shared/hardwareIdentity.test.cjs`

Expected: FAIL if the module does not yet append firmware version or drops the standalone motherboard model.

- [ ] **Step 3: Extend `SystemConfig` and normalize the backend snapshot**

Update `src/shared/types.ts` so `SystemConfig` becomes:

```ts
export interface SystemConfig {
  deviceModel: string
  cpu: string
  motherboard: string
  memory: string
  gpu: string
  monitor: string
  disk: string
  os: string
  installTime: number
}
```

Then update `src/main/services/SystemService.ts` to gather whole-device sources and call the shared helpers. Replace the current motherboard-only collection block and normalized return assembly with this code:

```ts
import {
  normalizeCompositeHardwareName,
  normalizeMonitorEntry,
  pickBestDeviceModel
} from '../../shared/hardwareIdentity'
```

```ts
const hwScript = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

# CPU
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name

# Whole-device identity
$csProduct = Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1
$computer = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1

# Motherboard
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1

# Memory
$mem_objs = Get-CimInstance Win32_PhysicalMemory
$total_bytes = 0
foreach($m in $mem_objs) { $total_bytes += [long]$m.Capacity }
$ram_gb = [Math]::Round($total_bytes / 1GB)
$ram_speed = ($mem_objs | Select-Object -First 1).ConfiguredClockSpeed
$ram_manu = ($mem_objs | Select-Object -First 1).Manufacturer
$ram = "$($ram_gb)GB|$($mem_objs.Count)|$($ram_speed)|$($ram_manu)"

# GPU (multiple)
$gpus = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch "Microsoft" -or $_.AdapterRAM -gt 0 } | ForEach-Object { $_.Name }
if (!$gpus) { $gpus = Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name } }
$gpu_str = ($gpus | Select-Object -Unique) -join [char]10

# Disk
$disks = Get-CimInstance Win32_DiskDrive | ForEach-Object { "$($_.Model) ($([Math]::Round($_.Size / 1GB))GB)" }
$disk_str = $disks -join [char]10

# Monitor via WMI
$mon_list = @()
try {
    $params = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction Stop
    $ids = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction Stop
    for ($i = 0; $i -lt $ids.Count; $i++) {
        $m = $ids[$i]
        $n_bytes = [byte[]]($m.UserFriendlyName | Where-Object { $_ -ne 0 })
        $name = if ($n_bytes) { [System.Text.Encoding]::ASCII.GetString($n_bytes).Trim() } else { "" }
        if (!$name -and $n_bytes) { $name = [System.Text.Encoding]::Unicode.GetString($n_bytes).Trim() }
        $m_bytes = [byte[]]($m.ManufacturerName | Where-Object { $_ -ne 0 })
        $manu = if ($m_bytes) { [System.Text.Encoding]::ASCII.GetString($m_bytes).Trim() } else { "Unknown" }
        $p = $params | Where-Object { $_.InstanceName -eq $m.InstanceName }
        if (!$p -and $params.Count -gt $i) { $p = $params[$i] }
        $native = if ($p -and $p.HorizontalActivePixels -gt 0) { "$($p.HorizontalActivePixels)x$($p.VerticalActivePixels)" } else { "" }
        if ($manu -ne "Unknown" -or $name) {
            $mon_list += "$manu|$name|$native"
        }
    }
} catch {}
if ($mon_list.Count -eq 0) {
    try {
        $pnp_mons = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Service -eq "monitor" }
        foreach ($pm in $pnp_mons) {
            $manu = "Unknown"
            if ($pm.DeviceID -match "DISPLAY\\\\([A-Z]{3})") { $manu = $Matches[1] }
            $model = if ($pm.Name -match "\\((.*)\\)") { $Matches[1] } else { $pm.Name }
            $mon_list += "$manu|$model|"
        }
    } catch {}
}
$mon_str = $mon_list -join [char]10

# OS
$os = (Get-CimInstance Win32_OperatingSystem | Select-Object -First 1).Caption

$info = @{
  cpu = $cpu
  csProductVendor = $csProduct.Vendor
  csProductName = $csProduct.Name
  csProductVersion = $csProduct.Version
  csManufacturer = $computer.Manufacturer
  csModel = $computer.Model
  mbManufacturer = $board.Manufacturer
  mbProduct = $board.Product
  ram = $ram
  gpu = $gpu_str
  disk = $disk_str
  mon = $mon_str
  os = $os
}
Write-Output "---HW_JSON_START---"
$info | ConvertTo-Json -Compress
Write-Output "---HW_JSON_END---"
`
```

```ts
const motherboard = normalizeCompositeHardwareName(
  data.mbManufacturer,
  data.mbProduct,
  'Unknown Motherboard'
)

const deviceModel = pickBestDeviceModel(
  [
    {
      manufacturer: data.csProductVendor,
      model: data.csProductName,
      version: data.csProductVersion
    },
    {
      manufacturer: data.csManufacturer,
      model: data.csModel,
      version: ''
    },
    {
      manufacturer: data.mbManufacturer,
      model: data.mbProduct,
      version: ''
    }
  ],
  motherboard,
  '未识别具体型号'
)

let monitorValue = ''
try {
  const { screen } = require('electron')
  const electronDisplays = screen.getAllDisplays()
  const monLines: string[] = data.mon
    ? data.mon.split(/\r?\n/).filter((line: string) => line.includes('|'))
    : []

  if (monLines.length > 0) {
    monitorValue = monLines
      .map((line: string, idx: number) => {
        const [manufacturer, name, resolution] = line.split('|')
        const fallbackResolution =
          !resolution || resolution === '0x0' || /^0x/i.test(resolution)
            ? electronDisplays[idx]
              ? `${Math.round(electronDisplays[idx].bounds.width * electronDisplays[idx].scaleFactor)}x${Math.round(electronDisplays[idx].bounds.height * electronDisplays[idx].scaleFactor)}`
              : ''
            : resolution

        return normalizeMonitorEntry(manufacturer, name, fallbackResolution)
      })
      .join('\n')
  } else {
    monitorValue = electronDisplays
      .map((display: Electron.Display, index: number) =>
        normalizeMonitorEntry(
          'Unknown',
          `Display ${index + 1}`,
          `${Math.round(display.bounds.width * display.scaleFactor)}x${Math.round(display.bounds.height * display.scaleFactor)}`
        )
      )
      .join('\n')
  }
} catch {
  monitorValue = data.mon || 'Unknown'
}

return {
  success: true,
  data: {
    deviceModel,
    cpu: data.cpu || 'Unknown Processor',
    motherboard,
    memory: data.ram || '',
    gpu: data.gpu || 'Unknown GPU',
    monitor: monitorValue,
    disk: data.disk || 'Unknown Storage',
    os: data.os || 'Windows',
    installTime: 1770000000000
  }
}
```

- [ ] **Step 4: Run tests and typecheck to verify the backend contract passes**

Run these commands:

```bash
node --test src/shared/hardwareIdentity.test.cjs
npm run typecheck:node
npm run typecheck:web
```

Expected:

- the shared tests PASS;
- `typecheck:node` PASSes with no `SystemConfig` or `Electron.Display` errors;
- `typecheck:web` PASSes with no renderer type drift caused by the new field.

- [ ] **Step 5: Commit the backend contract update**

```bash
git add src/shared/types.ts src/main/services/SystemService.ts src/shared/hardwareIdentity.ts src/shared/hardwareIdentity.test.cjs
git commit -m "feat: normalize hardware model detection"
```

### Task 3: Update the Configuration Checker UI and Report Output

**Files:**
- Modify: `src/renderer/src/components/ConfigChecker.tsx`
- Modify: `src/shared/hardwareIdentity.ts`
- Test: `src/shared/hardwareIdentity.test.cjs`

- [ ] **Step 1: Add a failing renderer-facing test for display translation stability**

Append this test to `src/shared/hardwareIdentity.test.cjs`:

```js
test('translateHardwareLabel leaves localized labels readable for exported reports', () => {
  assert.equal(
    translateHardwareLabel('Dell Latitude 7420'),
    '戴尔 (Dell) Latitude 7420'
  )
})
```

- [ ] **Step 2: Run the test file and verify the new display assertion fails before the renderer change**

Run: `node --test src/shared/hardwareIdentity.test.cjs`

Expected: FAIL if `translateHardwareLabel` does not yet produce the localized `戴尔 (Dell)` prefix.

- [ ] **Step 3: Update the renderer to show `设备型号`, share types, and export the new field**

Modify `src/renderer/src/components/ConfigChecker.tsx` with these changes:

```ts
import React, { useState, useEffect } from 'react'
import {
  Cpu,
  Monitor,
  CircuitBoard,
  MemoryStick,
  Check,
  Loader2,
  RefreshCw,
  Fingerprint,
  MonitorSmartphone,
  Copy,
  HardDrive
} from 'lucide-react'
import type { SystemConfig } from '../../../shared/types'
import { translateHardwareLabel } from '../../../shared/hardwareIdentity'
```

```ts
const CACHE_KEY = 'config-cache-v17'

const itemConfig = [
  { id: 'deviceModel', label: '设备型号', icon: Fingerprint, gradient: 'from-sky-500 to-cyan-600', accent: 'sky' },
  { id: 'cpu', label: '处理器', icon: Cpu, gradient: 'from-blue-500 to-indigo-500', accent: 'blue' },
  { id: 'motherboard', label: '主板', icon: CircuitBoard, gradient: 'from-violet-500 to-purple-600', accent: 'violet' },
  { id: 'gpu', label: '显卡', icon: MonitorSmartphone, gradient: 'from-cyan-500 to-blue-600', accent: 'cyan' },
  { id: 'memory', label: '内存', icon: MemoryStick, gradient: 'from-emerald-500 to-teal-600', accent: 'emerald' },
  { id: 'monitor', label: '显示器', icon: Monitor, gradient: 'from-amber-500 to-orange-500', accent: 'amber' },
  { id: 'disk', label: '存储', icon: HardDrive, gradient: 'from-rose-500 to-pink-600', accent: 'rose' }
] as const
```

```ts
const t = (value: string): string => {
  if (!value || value === 'Unknown') return ''
  return translateHardwareLabel(value)
}

const formatValueForReport = (id: string, value: string): string => {
  if (!value) return ''

  if (id === 'memory') {
    return formatRAM(value)
  }

  if (id === 'monitor') {
    return value
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const { name, res } = formatMonitor(line)
        return res ? `${name} (${res})` : name
      })
      .join('; ')
  }

  return t(value) || value
}
```

```ts
const result = await window.electron.systemConfig.getSystemConfig()
if (result.success && result.data) {
  setConfig(result.data)
  localStorage.setItem(CACHE_KEY, JSON.stringify(result.data))
}
```

```ts
useEffect(() => {
  const cached = localStorage.getItem(CACHE_KEY)
  if (cached) {
    try {
      setConfig(JSON.parse(cached))
    } catch {
      fetchConfig()
    }
  } else {
    fetchConfig()
  }
}, [])
```

```ts
const handleCopy = () => {
  const report =
    '[系统硬件快照]\n' +
    itemConfig
      .map((item) => {
        const value = (config as Record<string, string>)?.[item.id] || ''
        return `${item.label}: ${formatValueForReport(item.id, value)}`
      })
      .join('\n')

  navigator.clipboard.writeText(report)
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}
```

Also remove the local `SystemConfig` interface from this component so the renderer compiles against the shared contract.

- [ ] **Step 4: Run the targeted tests and full typecheck after the UI update**

Run these commands:

```bash
node --test src/shared/hardwareIdentity.test.cjs
npm run typecheck
```

Expected:

- the shared tests PASS, including the localized display-label assertion;
- `npm run typecheck` PASSes with no `ConfigChecker` type errors;
- the renderer accepts `deviceModel` as part of the shared `SystemConfig`.

- [ ] **Step 5: Commit the renderer update and final verification**

```bash
git add src/renderer/src/components/ConfigChecker.tsx src/shared/hardwareIdentity.ts src/shared/hardwareIdentity.test.cjs src/shared/types.ts src/main/services/SystemService.ts
git commit -m "feat: show normalized device models in config checker"
```

## Manual Smoke Checklist

After Task 3, verify these cases manually in the running app:

- A branded laptop shows `设备型号` as a whole-machine label such as `联想 (Lenovo) Legion ...` instead of a motherboard code.
- A branded desktop shows a whole-device model when Windows exposes one.
- A custom-built desktop falls back to motherboard identity and never shows `System Product Name` or `To Be Filled By O.E.M.`.
- Multi-monitor setups show one line per monitor and preserve resolution when available.
- Exported report output starts with `设备型号` and does not leak placeholder strings.

## Self-Review

- Spec coverage: shared normalization, backend selection order, UI card insertion, report ordering, placeholder filtering, and verification are each mapped to a task.
- Placeholder scan: no placeholder markers or vague deferred-work instructions remain.
- Type consistency: the plan uses `deviceModel`, `normalizeCompositeHardwareName`, `pickBestDeviceModel`, `normalizeMonitorEntry`, and `translateHardwareLabel` consistently across tests, backend code, and renderer code.
