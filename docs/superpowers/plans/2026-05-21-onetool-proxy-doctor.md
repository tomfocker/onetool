# OneTool Proxy Doctor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade OneTool's existing `local-proxy-manager` tool into a Windows-first Proxy Doctor that can diagnose and repair WinINET, WinHTTP, user environment variables, Git, npm, proxy port reachability, and process proxy evidence.

**Architecture:** Keep the existing tool ID and route, add a shared proxy-doctor model for pure state logic, extend `LocalProxyService` with dependency-injected command execution and doctor APIs, expose those APIs through IPC/preload, then replace the current proxy page with a diagnosis-first UI. The old `getStatus`, `setConfig`, `disable`, and `openSystemSettings` methods remain compatible while the new UI uses richer doctor snapshots.

**Tech Stack:** Electron, React 18, TypeScript, Tailwind CSS v3, lucide-react, Node `node:test`, PowerShell, Windows registry, `netsh`, Git, npm.

---

## File Structure

- Create: `src/shared/proxyDoctor.ts`
  - Owns runtime-safe shared constants, target normalization, layer summaries, report text, and display labels.
- Create: `src/shared/proxyDoctor.test.cjs`
  - Tests pure proxy-doctor model behavior without Electron or Windows commands.
- Modify: `src/shared/types.ts`
  - Keeps existing `LocalProxyConfig` and `LocalProxyStatus`; exports richer doctor-related interfaces when renderer and main need a single import path.
- Modify: `src/main/services/LocalProxyService.ts`
  - Keeps current WinINET APIs and adds doctor scan/apply/clear/fix methods.
  - Uses injected command dependencies in tests.
- Modify: `src/main/services/LocalProxyService.test.cjs`
  - Expands current tests to cover parsing, snapshots, repair commands, and failure paths.
- Modify: `src/main/ipc/localProxyIpc.ts`
  - Registers new doctor IPC channels.
- Modify: `src/preload/createElectronBridge.ts`
  - Exposes typed doctor methods under `window.electron.localProxy`.
- Modify: `src/preload/createElectronBridge.test.cjs`
  - Verifies channel mapping.
- Modify: `src/renderer/src/types/electron.d.ts`
  - Adds renderer-visible doctor API types.
- Create: `src/renderer/src/tools/localProxyDoctorViewModel.ts`
  - Keeps UI state labels, defaults, sorting, and form conversion testable outside React.
- Create: `src/renderer/src/tools/localProxyDoctorViewModel.test.cjs`
  - Tests UI view model logic.
- Modify: `src/renderer/src/tools/LocalProxyManagerTool.tsx`
  - Replaces the simple WinINET page with the Proxy Doctor UI.
- Modify: `src/renderer/src/data/tools.ts`
  - Changes display name/description while preserving `id: 'local-proxy-manager'`.
- Modify: `src/renderer/src/data/toolComponents.ts`
  - Changes dashboard metadata while preserving `id: 'local-proxy-manager'`.

## Task 1: Shared Proxy Doctor Model

**Files:**
- Create: `src/shared/proxyDoctor.ts`
- Create: `src/shared/proxyDoctor.test.cjs`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write failing tests for target normalization, summaries, and report generation**

Create `src/shared/proxyDoctor.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  normalizeProxyDoctorTarget,
  summarizeProxyDoctorLayers,
  buildProxyDoctorReport,
  PROXY_DOCTOR_LAYER_DEFINITIONS
} = require('./proxyDoctor.ts')

test('normalizeProxyDoctorTarget turns a port into a local HTTP target', () => {
  const target = normalizeProxyDoctorTarget('7897')

  assert.deepEqual(target, {
    input: '7897',
    protocol: 'http',
    host: '127.0.0.1',
    port: 7897,
    url: 'http://127.0.0.1:7897',
    winInetServer: 'http=127.0.0.1:7897;https=127.0.0.1:7897',
    envValue: 'http://127.0.0.1:7897'
  })
})

test('normalizeProxyDoctorTarget accepts socks5 URLs and maps WinINET socks server', () => {
  const target = normalizeProxyDoctorTarget('socks5://localhost:10808')

  assert.equal(target.protocol, 'socks5')
  assert.equal(target.host, 'localhost')
  assert.equal(target.port, 10808)
  assert.equal(target.url, 'socks5://localhost:10808')
  assert.equal(target.winInetServer, 'socks=localhost:10808')
})

test('normalizeProxyDoctorTarget rejects invalid ports and protocols', () => {
  assert.throws(() => normalizeProxyDoctorTarget('0'), /代理端口必须在 1-65535 之间/)
  assert.throws(() => normalizeProxyDoctorTarget('ftp://127.0.0.1:21'), /不支持的代理协议/)
})

test('summarizeProxyDoctorLayers reports unified, off, conflict, and error states', () => {
  assert.equal(summarizeProxyDoctorLayers([
    { id: 'wininet', state: 'ok', title: 'Windows 系统代理', currentValue: 'http://127.0.0.1:7897', detail: '', actionHint: '', canFix: true, canClear: true },
    { id: 'winhttp', state: 'ok', title: 'WinHTTP 代理', currentValue: 'http://127.0.0.1:7897', detail: '', actionHint: '', canFix: true, canClear: true }
  ]), 'unified')

  assert.equal(summarizeProxyDoctorLayers([
    { id: 'wininet', state: 'off', title: 'Windows 系统代理', currentValue: '', detail: '', actionHint: '', canFix: true, canClear: false },
    { id: 'git', state: 'off', title: 'Git 代理', currentValue: '', detail: '', actionHint: '', canFix: true, canClear: false }
  ]), 'off')

  assert.equal(summarizeProxyDoctorLayers([
    { id: 'wininet', state: 'ok', title: 'Windows 系统代理', currentValue: 'http://127.0.0.1:7897', detail: '', actionHint: '', canFix: true, canClear: true },
    { id: 'npm', state: 'conflict', title: 'npm 代理', currentValue: 'http://127.0.0.1:1080', detail: '', actionHint: '', canFix: true, canClear: true }
  ]), 'conflict')
})

test('buildProxyDoctorReport includes all diagnostic layer names', () => {
  const target = normalizeProxyDoctorTarget('7897')
  const report = buildProxyDoctorReport({
    target,
    summary: 'conflict',
    portOpen: false,
    generatedAt: '2026-05-21T00:00:00.000Z',
    layers: PROXY_DOCTOR_LAYER_DEFINITIONS.map((definition) => ({
      id: definition.id,
      title: definition.title,
      state: 'off',
      currentValue: '',
      detail: definition.description,
      actionHint: definition.actionHint,
      canFix: definition.canFix,
      canClear: definition.canClear
    })),
    log: ['scan started']
  })

  assert.match(report, /目标代理: http:\/\/127\.0\.0\.1:7897/)
  assert.match(report, /Windows 系统代理/)
  assert.match(report, /WinHTTP 代理/)
  assert.match(report, /Git 代理/)
  assert.match(report, /npm 代理/)
})
```

- [ ] **Step 2: Run the shared model test and verify it fails**

Run:

```bash
npm test -- src/shared/proxyDoctor.test.cjs
```

Expected: FAIL because `src/shared/proxyDoctor.ts` does not exist.

- [ ] **Step 3: Create the shared model implementation**

Create `src/shared/proxyDoctor.ts`:

```ts
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
  title: string
  state: ProxyDoctorLayerState
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
  reportText: string
  log: string[]
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
    description: '影响遵循 WinINET 设置的桌面应用、系统 WebView 和部分浏览器。',
    actionHint: '写入当前用户的 Windows 代理开关和旁路规则。',
    canFix: true,
    canClear: true
  },
  {
    id: 'winhttp',
    title: 'WinHTTP 代理',
    description: '影响系统服务、部分安装器和使用 WinHTTP 的命令行程序。',
    actionHint: '从目标代理写入 WinHTTP，或从系统代理同步。',
    canFix: true,
    canClear: true
  },
  {
    id: 'env',
    title: '命令行环境变量',
    description: '影响新打开的 PowerShell、CMD、Node、Python、curl 等开发工具。',
    actionHint: '写入当前用户级代理环境变量，新进程才会继承。',
    canFix: true,
    canClear: true
  },
  {
    id: 'git',
    title: 'Git 代理',
    description: '只影响 git fetch、pull、push、clone 等 Git 网络操作。',
    actionHint: '写入 git config --global http.proxy 和 https.proxy。',
    canFix: true,
    canClear: true
  },
  {
    id: 'npm',
    title: 'npm 代理',
    description: '影响 npm install、npm publish 等 Node 包管理网络请求。',
    actionHint: '写入 npm config proxy 和 https-proxy。',
    canFix: true,
    canClear: true
  },
  {
    id: 'process',
    title: '当前进程',
    description: '显示 OneTool 当前进程实际继承到的代理环境。',
    actionHint: '修改用户环境变量后，重启应用才能看到新环境。',
    canFix: false,
    canClear: false
  },
  {
    id: 'codex',
    title: 'Codex 进程',
    description: '显示可检测到的 Codex 相关进程代理证据。',
    actionHint: '修改用户环境变量或 GUI 环境后，完整退出并重开 Codex。',
    canFix: false,
    canClear: false
  }
]

function assertValidPort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('代理端口必须在 1-65535 之间')
  }
}

function normalizeProtocol(protocol: string): ProxyDoctorProtocol {
  const value = protocol.toLowerCase()
  if (value === 'http' || value === 'https' || value === 'socks5') {
    return value
  }
  throw new Error(`不支持的代理协议: ${protocol}`)
}

export function normalizeProxyDoctorTarget(input: string): ProxyDoctorTarget {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('代理地址不能为空')
  }

  if (/^\d+$/.test(trimmed)) {
    const port = Number(trimmed)
    assertValidPort(port)
    return {
      input: trimmed,
      protocol: 'http',
      host: '127.0.0.1',
      port,
      url: `http://127.0.0.1:${port}`,
      winInetServer: `http=127.0.0.1:${port};https=127.0.0.1:${port}`,
      envValue: `http://127.0.0.1:${port}`
    }
  }

  const withScheme = trimmed.includes('://') ? trimmed : `http://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error('代理地址格式不正确')
  }

  const protocol = normalizeProtocol(parsed.protocol.replace(':', ''))
  const host = parsed.hostname
  const port = Number(parsed.port)
  if (!host) {
    throw new Error('代理地址缺少主机名')
  }
  assertValidPort(port)

  const url = `${protocol}://${host}:${port}`
  const winInetServer = protocol === 'socks5'
    ? `socks=${host}:${port}`
    : `http=${host}:${port};https=${host}:${port}`

  return {
    input: trimmed,
    protocol,
    host,
    port,
    url,
    winInetServer,
    envValue: url
  }
}

const CORE_LAYER_IDS: ProxyDoctorLayerId[] = ['wininet', 'winhttp', 'env', 'git', 'npm']

export function summarizeProxyDoctorLayers(layers: ProxyDoctorLayerStatus[]): ProxyDoctorSummary {
  const core = layers.filter((layer) => CORE_LAYER_IDS.includes(layer.id))
  if (core.some((layer) => layer.state === 'error')) return 'error'
  if (core.some((layer) => layer.state === 'conflict')) return 'conflict'
  if (core.length > 0 && core.every((layer) => layer.state === 'ok' || layer.state === 'unavailable')) return 'unified'
  if (core.length > 0 && core.every((layer) => layer.state === 'off' || layer.state === 'unavailable')) return 'off'
  return 'conflict'
}

export function getProxyDoctorSummaryLabel(summary: ProxyDoctorSummary): string {
  if (summary === 'unified') return '开发代理已统一'
  if (summary === 'off') return '开发代理未启用'
  if (summary === 'conflict') return '代理配置存在冲突'
  return '无法完成诊断'
}

export function buildProxyDoctorReport(input: Omit<ProxyDoctorSnapshot, 'reportText'>): string {
  const lines = [
    'OneTool 代理医生诊断报告',
    `生成时间: ${input.generatedAt}`,
    `目标代理: ${input.target.url}`,
    `汇总状态: ${getProxyDoctorSummaryLabel(input.summary)}`,
    `端口状态: ${input.portOpen ? '可连接' : '不可连接或未检测到'}`,
    '',
    '分层状态:'
  ]

  for (const layer of input.layers) {
    lines.push(`- ${layer.title}: ${layer.state}`)
    lines.push(`  当前值: ${layer.currentValue || '未设置'}`)
    lines.push(`  说明: ${layer.detail}`)
    lines.push(`  建议: ${layer.actionHint}`)
  }

  if (input.log.length > 0) {
    lines.push('')
    lines.push('执行日志:')
    lines.push(...input.log.map((line) => `- ${line}`))
  }

  return lines.join('\n')
}
```

Modify `src/shared/types.ts` by adding this export near the local proxy interfaces:

```ts
export type {
  ProxyDoctorApplyRequest,
  ProxyDoctorLayerId,
  ProxyDoctorLayerState,
  ProxyDoctorLayerStatus,
  ProxyDoctorSnapshot,
  ProxyDoctorSummary,
  ProxyDoctorTarget
} from './proxyDoctor'
```

- [ ] **Step 4: Run the shared model test and verify it passes**

Run:

```bash
npm test -- src/shared/proxyDoctor.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/proxyDoctor.ts src/shared/proxyDoctor.test.cjs src/shared/types.ts
git commit -m "feat: add proxy doctor shared model"
```

## Task 2: LocalProxyService Doctor Scan

**Files:**
- Modify: `src/main/services/LocalProxyService.ts`
- Modify: `src/main/services/LocalProxyService.test.cjs`

- [ ] **Step 1: Write failing tests for doctorScan**

Append these tests to `src/main/services/LocalProxyService.test.cjs`:

```js
test('doctorScan returns layered Windows proxy diagnostics', async () => {
  const commands = []
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService({
    execPowerShellEncoded: async (script) => {
      if (script.includes('Get-ItemProperty')) {
        return [
          '---LOCAL_PROXY_JSON_START---',
          '{"enabled":true,"server":"http=127.0.0.1:7897;https=127.0.0.1:7897","override":"localhost;127.*","autoConfigUrl":null}',
          '---LOCAL_PROXY_JSON_END---'
        ].join('\n')
      }
      if (script.includes('Environment]::GetEnvironmentVariable')) {
        return [
          '---PROXY_ENV_JSON_START---',
          '{"HTTP_PROXY":"http://127.0.0.1:7897","HTTPS_PROXY":"http://127.0.0.1:7897","ALL_PROXY":"http://127.0.0.1:7897","http_proxy":"http://127.0.0.1:7897","https_proxy":"http://127.0.0.1:7897","all_proxy":"http://127.0.0.1:7897","NO_PROXY":"localhost,127.0.0.1,::1","no_proxy":"localhost,127.0.0.1,::1"}',
          '---PROXY_ENV_JSON_END---'
        ].join('\n')
      }
      return 'ok'
    },
    execCommand: async (command) => {
      commands.push(command)
      if (command === 'netsh winhttp show proxy') return 'Proxy Server(s) :  http=127.0.0.1:7897;https=127.0.0.1:7897\r\nBypass List     :  localhost;127.*'
      if (command === 'git config --global --get http.proxy') return 'http://127.0.0.1:7897'
      if (command === 'git config --global --get https.proxy') return 'http://127.0.0.1:7897'
      if (command === 'npm config get proxy') return 'http://127.0.0.1:7897'
      if (command === 'npm config get https-proxy') return 'http://127.0.0.1:7897'
      return ''
    },
    connectToPort: async () => true,
    processEnv: {
      HTTP_PROXY: 'http://127.0.0.1:7897',
      HTTPS_PROXY: 'http://127.0.0.1:7897'
    }
  })

  const result = await service.doctorScan('7897')

  assert.equal(result.success, true)
  assert.equal(result.data.summary, 'unified')
  assert.equal(result.data.portOpen, true)
  assert.equal(result.data.layers.find((layer) => layer.id === 'wininet').state, 'ok')
  assert.equal(result.data.layers.find((layer) => layer.id === 'winhttp').state, 'ok')
  assert.equal(result.data.layers.find((layer) => layer.id === 'git').state, 'ok')
  assert.equal(result.data.layers.find((layer) => layer.id === 'npm').state, 'ok')
  assert.match(result.data.reportText, /OneTool 代理医生诊断报告/)
  assert.ok(commands.includes('netsh winhttp show proxy'))
})

test('doctorScan marks Git and npm as unavailable when command output indicates missing tools', async () => {
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService({
    execPowerShellEncoded: async (script) => {
      if (script.includes('Get-ItemProperty')) {
        return [
          '---LOCAL_PROXY_JSON_START---',
          '{"enabled":false,"server":"","override":"","autoConfigUrl":null}',
          '---LOCAL_PROXY_JSON_END---'
        ].join('\n')
      }
      return [
        '---PROXY_ENV_JSON_START---',
        '{}',
        '---PROXY_ENV_JSON_END---'
      ].join('\n')
    },
    execCommand: async (command) => {
      if (command.includes('git config')) throw new Error('git not found')
      if (command.includes('npm config')) throw new Error('npm not found')
      return 'Direct access (no proxy server).'
    },
    connectToPort: async () => false,
    processEnv: {}
  })

  const result = await service.doctorScan('7897')

  assert.equal(result.success, true)
  assert.equal(result.data.summary, 'off')
  assert.equal(result.data.layers.find((layer) => layer.id === 'git').state, 'unavailable')
  assert.equal(result.data.layers.find((layer) => layer.id === 'npm').state, 'unavailable')
})
```

- [ ] **Step 2: Run the service test and verify it fails**

Run:

```bash
npm test -- src/main/services/LocalProxyService.test.cjs
```

Expected: FAIL because `doctorScan` is not defined.

- [ ] **Step 3: Add dependency injection and doctor scan implementation**

Modify imports in `src/main/services/LocalProxyService.ts`:

```ts
import net from 'net'
import { spawn } from 'child_process'
import { execCommand, execPowerShellEncoded } from '../utils/processUtils'
import { logger } from '../utils/logger'
import {
  IpcResponse,
  LocalProxyConfig,
  LocalProxyStatus,
  ProxyProtocol
} from '../../shared/types'
import {
  PROXY_DOCTOR_DEFAULT_NO_PROXY,
  PROXY_DOCTOR_LAYER_DEFINITIONS,
  PROXY_DOCTOR_NO_PROXY_KEYS,
  PROXY_DOCTOR_PROXY_KEYS,
  ProxyDoctorLayerId,
  ProxyDoctorLayerStatus,
  ProxyDoctorSnapshot,
  ProxyDoctorTarget,
  buildProxyDoctorReport,
  normalizeProxyDoctorTarget,
  summarizeProxyDoctorLayers
} from '../../shared/proxyDoctor'
```

Add these helpers above `export class LocalProxyService`:

```ts
type LocalProxyServiceDependencies = {
  execPowerShellEncoded: (script: string, timeoutMs?: number) => Promise<string>
  execCommand: (command: string, timeoutMs?: number) => Promise<string>
  connectToPort: (host: string, port: number, timeoutMs?: number) => Promise<boolean>
  processEnv: NodeJS.ProcessEnv
  spawn: typeof spawn
}

const defaultDependencies: LocalProxyServiceDependencies = {
  execPowerShellEncoded,
  execCommand,
  connectToPort: testPortConnection,
  processEnv: process.env,
  spawn
}

function getLayerDefinition(id: ProxyDoctorLayerId) {
  return PROXY_DOCTOR_LAYER_DEFINITIONS.find((layer) => layer.id === id)!
}

function makeLayer(
  id: ProxyDoctorLayerId,
  state: ProxyDoctorLayerStatus['state'],
  currentValue: string,
  detail?: string
): ProxyDoctorLayerStatus {
  const definition = getLayerDefinition(id)
  return {
    id,
    title: definition.title,
    state,
    currentValue,
    detail: detail || definition.description,
    actionHint: definition.actionHint,
    canFix: definition.canFix,
    canClear: definition.canClear && state !== 'off'
  }
}

function valuesMatchTarget(values: string[], target: ProxyDoctorTarget) {
  const filled = values.map((value) => value.trim()).filter(Boolean)
  if (filled.length === 0) return 'off'
  return filled.every((value) => value === target.envValue || value === target.url || value === target.winInetServer)
    ? 'ok'
    : 'conflict'
}

function parseJsonBetweenMarkers<T>(text: string, start: string, end: string): T | null {
  const match = text.match(new RegExp(`${start}([\\s\\S]*?)${end}`))
  if (!match?.[1]) return null
  return JSON.parse(match[1].trim()) as T
}

function parseWinHttpProxy(output: string) {
  const direct = /Direct access|直接访问|没有代理服务器/i.test(output)
  if (direct) {
    return { enabled: false, server: '', bypass: '' }
  }

  const server = output.match(/Proxy Server\(s\)\s*:\s*([^\r\n]+)/i)?.[1]?.trim()
    || output.match(/代理服务器\s*:\s*([^\r\n]+)/i)?.[1]?.trim()
    || ''
  const bypass = output.match(/Bypass List\s*:\s*([^\r\n]+)/i)?.[1]?.trim()
    || output.match(/绕过列表\s*:\s*([^\r\n]+)/i)?.[1]?.trim()
    || ''
  return { enabled: Boolean(server), server, bypass }
}

function testPortConnection(host: string, port: number, timeoutMs: number = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const finish = (value: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}
```

Update the class constructor and command usage:

```ts
export class LocalProxyService {
  private deps: LocalProxyServiceDependencies

  constructor(dependencies: Partial<LocalProxyServiceDependencies> = {}) {
    this.deps = { ...defaultDependencies, ...dependencies }
  }
```

Replace direct `execPowerShellEncoded(...)` calls with `this.deps.execPowerShellEncoded(...)`, and direct `spawn(...)` usage with `this.deps.spawn(...)`.

Add doctor scan methods inside the class:

```ts
  private async readUserProxyEnv() {
    const names = [...PROXY_DOCTOR_PROXY_KEYS, ...PROXY_DOCTOR_NO_PROXY_KEYS]
    const script = `
$ErrorActionPreference = 'Stop'
$result = @{}
${names.map((name) => `$result['${name}'] = [System.Environment]::GetEnvironmentVariable('${name}', 'User')`).join('\n')}
Write-Output '---PROXY_ENV_JSON_START---'
$result | ConvertTo-Json -Compress
Write-Output '---PROXY_ENV_JSON_END---'
`
    const raw = await this.deps.execPowerShellEncoded(script)
    return parseJsonBetweenMarkers<Record<string, string | null>>(raw, '---PROXY_ENV_JSON_START---', '---PROXY_ENV_JSON_END---') || {}
  }

  private async buildWinInetLayer(target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    const status = await this.getStatus()
    if (!status.success || !status.data) {
      return makeLayer('wininet', 'error', '', status.error || '无法读取 Windows 系统代理')
    }
    if (!status.data.enabled || !status.data.server) {
      return makeLayer('wininet', 'off', '', 'Windows 系统代理未启用。')
    }
    return makeLayer('wininet', status.data.server === target.winInetServer ? 'ok' : 'conflict', status.data.server)
  }

  private async buildWinHttpLayer(target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    try {
      const output = await this.deps.execCommand('netsh winhttp show proxy', 10000)
      const parsed = parseWinHttpProxy(output)
      if (!parsed.enabled) {
        return makeLayer('winhttp', 'off', '', 'WinHTTP 当前为直接访问。')
      }
      return makeLayer('winhttp', parsed.server === target.winInetServer ? 'ok' : 'conflict', parsed.server)
    } catch (error) {
      return makeLayer('winhttp', 'error', '', (error as Error).message)
    }
  }

  private async buildEnvLayer(target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    try {
      const env = await this.readUserProxyEnv()
      const values = PROXY_DOCTOR_PROXY_KEYS.map((key) => env[key] || '')
      const state = valuesMatchTarget(values, target)
      const current = PROXY_DOCTOR_PROXY_KEYS.map((key) => `${key}=${env[key] || ''}`).join(' / ')
      return makeLayer('env', state, current)
    } catch (error) {
      return makeLayer('env', 'error', '', (error as Error).message)
    }
  }

  private async buildToolLayer(id: 'git' | 'npm', target: ProxyDoctorTarget): Promise<ProxyDoctorLayerStatus> {
    try {
      const commands = id === 'git'
        ? ['git config --global --get http.proxy', 'git config --global --get https.proxy']
        : ['npm config get proxy', 'npm config get https-proxy']
      const values = await Promise.all(commands.map(async (command) => {
        const output = await this.deps.execCommand(command, 10000)
        return output.trim() === 'null' ? '' : output.trim()
      }))
      const state = valuesMatchTarget(values, target)
      return makeLayer(id, state, values.map((value, index) => `${index === 0 ? 'http' : 'https'}=${value || ''}`).join(' / '))
    } catch (error) {
      return makeLayer(id, 'unavailable', '', (error as Error).message)
    }
  }

  private buildCurrentProcessLayer(target: ProxyDoctorTarget): ProxyDoctorLayerStatus {
    const values = PROXY_DOCTOR_PROXY_KEYS.map((key) => this.deps.processEnv[key] || '')
    const state = valuesMatchTarget(values, target)
    const current = PROXY_DOCTOR_PROXY_KEYS.map((key) => `${key}=${this.deps.processEnv[key] || ''}`).join(' / ')
    return makeLayer('process', state, current, 'OneTool 当前进程环境只作为证据显示。')
  }

  private buildCodexLayer(): ProxyDoctorLayerStatus {
    return makeLayer('codex', 'unavailable', '', '第一版不强制枚举外部进程环境；请用用户环境变量和重启 Codex 验证。')
  }

  async doctorScan(targetInput: string): Promise<IpcResponse<ProxyDoctorSnapshot>> {
    try {
      const target = normalizeProxyDoctorTarget(targetInput)
      const [portOpen, wininet, winhttp, env, git, npm] = await Promise.all([
        this.deps.connectToPort(target.host, target.port),
        this.buildWinInetLayer(target),
        this.buildWinHttpLayer(target),
        this.buildEnvLayer(target),
        this.buildToolLayer('git', target),
        this.buildToolLayer('npm', target)
      ])
      const layers = [
        wininet,
        winhttp,
        env,
        git,
        npm,
        this.buildCurrentProcessLayer(target),
        this.buildCodexLayer()
      ]
      const snapshotWithoutReport = {
        target,
        summary: summarizeProxyDoctorLayers(layers),
        portOpen,
        generatedAt: new Date().toISOString(),
        layers,
        log: ['扫描完成']
      }
      const reportText = buildProxyDoctorReport(snapshotWithoutReport)
      return { success: true, data: { ...snapshotWithoutReport, reportText } }
    } catch (error) {
      logger.error('[LocalProxyService] doctorScan failed', error)
      return { success: false, error: (error as Error).message }
    }
  }
```

- [ ] **Step 4: Run the service test and verify it passes**

Run:

```bash
npm test -- src/main/services/LocalProxyService.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/LocalProxyService.ts src/main/services/LocalProxyService.test.cjs
git commit -m "feat: add proxy doctor scan service"
```

## Task 3: LocalProxyService Repair and Clear Actions

**Files:**
- Modify: `src/main/services/LocalProxyService.ts`
- Modify: `src/main/services/LocalProxyService.test.cjs`

- [ ] **Step 1: Write failing tests for apply, clear, fix layer, and clear layer**

Append to `src/main/services/LocalProxyService.test.cjs`:

```js
test('doctorApplyAll writes every managed proxy layer', async () => {
  const powershellScripts = []
  const commands = []
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService({
    execPowerShellEncoded: async (script) => {
      powershellScripts.push(script)
      if (script.includes('Get-ItemProperty')) {
        return [
          '---LOCAL_PROXY_JSON_START---',
          '{"enabled":true,"server":"http=127.0.0.1:7897;https=127.0.0.1:7897","override":"localhost;127.*","autoConfigUrl":null}',
          '---LOCAL_PROXY_JSON_END---'
        ].join('\n')
      }
      if (script.includes('Environment]::GetEnvironmentVariable')) {
        return [
          '---PROXY_ENV_JSON_START---',
          '{"HTTP_PROXY":"http://127.0.0.1:7897","HTTPS_PROXY":"http://127.0.0.1:7897","ALL_PROXY":"http://127.0.0.1:7897"}',
          '---PROXY_ENV_JSON_END---'
        ].join('\n')
      }
      return 'ok'
    },
    execCommand: async (command) => {
      commands.push(command)
      if (command === 'netsh winhttp show proxy') return 'Proxy Server(s) :  http=127.0.0.1:7897;https=127.0.0.1:7897'
      if (command.includes('--get') || command.includes('get proxy') || command.includes('get https-proxy')) return 'http://127.0.0.1:7897'
      return 'ok'
    },
    connectToPort: async () => true,
    processEnv: {}
  })

  const result = await service.doctorApplyAll({ target: '7897', bypass: ['localhost', '127.*'] })

  assert.equal(result.success, true)
  assert.ok(powershellScripts.some((script) => script.includes("Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 1")))
  assert.ok(powershellScripts.some((script) => script.includes("[System.Environment]::SetEnvironmentVariable('HTTP_PROXY'")))
  assert.ok(commands.includes('netsh winhttp set proxy proxy-server="http=127.0.0.1:7897;https=127.0.0.1:7897" bypass-list="localhost;127.*"'))
  assert.ok(commands.includes('git config --global http.proxy http://127.0.0.1:7897'))
  assert.ok(commands.includes('npm config set proxy http://127.0.0.1:7897'))
})

test('doctorClearLayer clears only the selected layer', async () => {
  const commands = []
  const { LocalProxyService } = loadLocalProxyServiceModule()
  const service = new LocalProxyService({
    execPowerShellEncoded: async () => 'ok',
    execCommand: async (command) => {
      commands.push(command)
      return 'ok'
    },
    connectToPort: async () => false,
    processEnv: {}
  })

  const result = await service.doctorClearLayer('git')

  assert.equal(result.success, true)
  assert.deepEqual(commands, [
    'git config --global --unset http.proxy',
    'git config --global --unset https.proxy'
  ])
})
```

- [ ] **Step 2: Run the service test and verify it fails**

Run:

```bash
npm test -- src/main/services/LocalProxyService.test.cjs
```

Expected: FAIL because `doctorApplyAll` and `doctorClearLayer` are not defined.

- [ ] **Step 3: Implement repair and clear methods**

Add these methods inside `LocalProxyService`:

```ts
  private async setWinHttpProxy(target: ProxyDoctorTarget, bypass: string[]) {
    const bypassList = bypass.filter(Boolean).join(';')
    return this.deps.execCommand(`netsh winhttp set proxy proxy-server="${target.winInetServer}" bypass-list="${bypassList}"`, 10000)
  }

  private async resetWinHttpProxy() {
    return this.deps.execCommand('netsh winhttp reset proxy', 10000)
  }

  private async setUserProxyEnv(target: ProxyDoctorTarget) {
    const script = `
$ErrorActionPreference = 'Stop'
${PROXY_DOCTOR_PROXY_KEYS.map((key) => `[System.Environment]::SetEnvironmentVariable('${key}', '${escapePowerShellString(target.envValue)}', 'User')`).join('\n')}
${PROXY_DOCTOR_NO_PROXY_KEYS.map((key) => `[System.Environment]::SetEnvironmentVariable('${key}', '${PROXY_DOCTOR_DEFAULT_NO_PROXY}', 'User')`).join('\n')}
Write-Output 'ok'
`
    return this.deps.execPowerShellEncoded(script)
  }

  private async clearUserProxyEnv() {
    const names = [...PROXY_DOCTOR_PROXY_KEYS, ...PROXY_DOCTOR_NO_PROXY_KEYS]
    const script = `
$ErrorActionPreference = 'Stop'
${names.map((key) => `[System.Environment]::SetEnvironmentVariable('${key}', $null, 'User')`).join('\n')}
Write-Output 'ok'
`
    return this.deps.execPowerShellEncoded(script)
  }

  private async setGitProxy(target: ProxyDoctorTarget) {
    await this.deps.execCommand(`git config --global http.proxy ${target.envValue}`, 10000)
    await this.deps.execCommand(`git config --global https.proxy ${target.envValue}`, 10000)
  }

  private async clearGitProxy() {
    await this.deps.execCommand('git config --global --unset http.proxy', 10000)
    await this.deps.execCommand('git config --global --unset https.proxy', 10000)
  }

  private async setNpmProxy(target: ProxyDoctorTarget) {
    await this.deps.execCommand(`npm config set proxy ${target.envValue}`, 10000)
    await this.deps.execCommand(`npm config set https-proxy ${target.envValue}`, 10000)
  }

  private async clearNpmProxy() {
    await this.deps.execCommand('npm config delete proxy', 10000)
    await this.deps.execCommand('npm config delete https-proxy', 10000)
  }

  async doctorApplyAll(request: { target: string; bypass: string[] }): Promise<IpcResponse<ProxyDoctorSnapshot>> {
    try {
      const target = normalizeProxyDoctorTarget(request.target)
      await this.setConfig({
        host: target.host,
        port: target.port,
        protocol: target.protocol === 'socks5' ? 'socks5' : 'http',
        bypass: request.bypass
      })
      await this.setWinHttpProxy(target, request.bypass)
      await this.setUserProxyEnv(target)
      await this.setGitProxy(target)
      await this.setNpmProxy(target)
      return this.doctorScan(target.url)
    } catch (error) {
      logger.error('[LocalProxyService] doctorApplyAll failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorClearAll(): Promise<IpcResponse> {
    try {
      await this.disable()
      await this.resetWinHttpProxy()
      await this.clearUserProxyEnv()
      await this.clearGitProxy()
      await this.clearNpmProxy()
      return { success: true }
    } catch (error) {
      logger.error('[LocalProxyService] doctorClearAll failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorFixLayer(layerId: ProxyDoctorLayerId, targetInput: string, bypass: string[] = []): Promise<IpcResponse> {
    try {
      const target = normalizeProxyDoctorTarget(targetInput)
      if (layerId === 'wininet') {
        return this.setConfig({ host: target.host, port: target.port, protocol: target.protocol === 'socks5' ? 'socks5' : 'http', bypass })
      }
      if (layerId === 'winhttp') await this.setWinHttpProxy(target, bypass)
      if (layerId === 'env') await this.setUserProxyEnv(target)
      if (layerId === 'git') await this.setGitProxy(target)
      if (layerId === 'npm') await this.setNpmProxy(target)
      return { success: true }
    } catch (error) {
      logger.error('[LocalProxyService] doctorFixLayer failed', error)
      return { success: false, error: (error as Error).message }
    }
  }

  async doctorClearLayer(layerId: ProxyDoctorLayerId): Promise<IpcResponse> {
    try {
      if (layerId === 'wininet') return this.disable()
      if (layerId === 'winhttp') await this.resetWinHttpProxy()
      if (layerId === 'env') await this.clearUserProxyEnv()
      if (layerId === 'git') await this.clearGitProxy()
      if (layerId === 'npm') await this.clearNpmProxy()
      return { success: true }
    } catch (error) {
      logger.error('[LocalProxyService] doctorClearLayer failed', error)
      return { success: false, error: (error as Error).message }
    }
  }
```

- [ ] **Step 4: Run the service test and verify it passes**

Run:

```bash
npm test -- src/main/services/LocalProxyService.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/LocalProxyService.ts src/main/services/LocalProxyService.test.cjs
git commit -m "feat: add proxy doctor repair actions"
```

## Task 4: IPC, Preload Bridge, and Renderer Types

**Files:**
- Modify: `src/main/ipc/localProxyIpc.ts`
- Modify: `src/preload/createElectronBridge.ts`
- Modify: `src/preload/createElectronBridge.test.cjs`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Write failing preload bridge test**

Append to `src/preload/createElectronBridge.test.cjs`:

```js
test('createElectronBridge maps proxy doctor IPC channels', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  await bridge.localProxy.doctorScan('7897')
  await bridge.localProxy.doctorApplyAll({ target: '7897', bypass: ['localhost'] })
  await bridge.localProxy.doctorClearAll()
  await bridge.localProxy.doctorFixLayer('git', '7897', ['localhost'])
  await bridge.localProxy.doctorClearLayer('npm')

  assert.deepEqual(mocks.invokeCalls.slice(-5), [
    ['local-proxy:doctor-scan', '7897'],
    ['local-proxy:doctor-apply-all', { target: '7897', bypass: ['localhost'] }],
    ['local-proxy:doctor-clear-all'],
    ['local-proxy:doctor-fix-layer', { layerId: 'git', target: '7897', bypass: ['localhost'] }],
    ['local-proxy:doctor-clear-layer', 'npm']
  ])
})
```

- [ ] **Step 2: Run the preload bridge test and verify it fails**

Run:

```bash
npm test -- src/preload/createElectronBridge.test.cjs
```

Expected: FAIL because doctor bridge methods do not exist.

- [ ] **Step 3: Register doctor IPC handlers**

Modify `src/main/ipc/localProxyIpc.ts` imports:

```ts
import { LocalProxyConfig, ProxyDoctorApplyRequest, ProxyDoctorLayerId } from '../../shared/types'
```

Add handlers inside `registerLocalProxyIpc()`:

```ts
  ipcMain.handle('local-proxy:doctor-scan', async (_event, target: string) => {
    return localProxyService.doctorScan(target)
  })

  ipcMain.handle('local-proxy:doctor-apply-all', async (_event, request: ProxyDoctorApplyRequest) => {
    return localProxyService.doctorApplyAll(request)
  })

  ipcMain.handle('local-proxy:doctor-clear-all', async () => {
    return localProxyService.doctorClearAll()
  })

  ipcMain.handle('local-proxy:doctor-fix-layer', async (
    _event,
    input: { layerId: ProxyDoctorLayerId; target: string; bypass: string[] }
  ) => {
    return localProxyService.doctorFixLayer(input.layerId, input.target, input.bypass)
  })

  ipcMain.handle('local-proxy:doctor-clear-layer', async (_event, layerId: ProxyDoctorLayerId) => {
    return localProxyService.doctorClearLayer(layerId)
  })
```

- [ ] **Step 4: Expose doctor methods in preload**

Modify imports in `src/preload/createElectronBridge.ts` to include:

```ts
  ProxyDoctorApplyRequest,
  ProxyDoctorLayerId,
  ProxyDoctorSnapshot,
```

Replace `localProxyAPI` with:

```ts
  const localProxyAPI = {
    getStatus: () => ipcRenderer.invoke('local-proxy:get-status'),
    setConfig: (config: LocalProxyConfig) => ipcRenderer.invoke('local-proxy:set-config', config),
    disable: () => ipcRenderer.invoke('local-proxy:disable'),
    openSystemSettings: () => ipcRenderer.invoke('local-proxy:open-system-settings'),
    doctorScan: (target: string) => ipcRenderer.invoke('local-proxy:doctor-scan', target) as Promise<IpcResponse<ProxyDoctorSnapshot>>,
    doctorApplyAll: (request: ProxyDoctorApplyRequest) => ipcRenderer.invoke('local-proxy:doctor-apply-all', request) as Promise<IpcResponse<ProxyDoctorSnapshot>>,
    doctorClearAll: () => ipcRenderer.invoke('local-proxy:doctor-clear-all') as Promise<IpcResponse>,
    doctorFixLayer: (layerId: ProxyDoctorLayerId, target: string, bypass: string[]) => {
      return ipcRenderer.invoke('local-proxy:doctor-fix-layer', { layerId, target, bypass }) as Promise<IpcResponse>
    },
    doctorClearLayer: (layerId: ProxyDoctorLayerId) => ipcRenderer.invoke('local-proxy:doctor-clear-layer', layerId) as Promise<IpcResponse>
  }
```

Modify `src/renderer/src/types/electron.d.ts` imports and `localProxy` interface to include the same methods:

```ts
        doctorScan: (target: string) => Promise<IpcResponse<ProxyDoctorSnapshot>>
        doctorApplyAll: (request: ProxyDoctorApplyRequest) => Promise<IpcResponse<ProxyDoctorSnapshot>>
        doctorClearAll: () => Promise<IpcResponse>
        doctorFixLayer: (layerId: ProxyDoctorLayerId, target: string, bypass: string[]) => Promise<IpcResponse>
        doctorClearLayer: (layerId: ProxyDoctorLayerId) => Promise<IpcResponse>
```

- [ ] **Step 5: Run tests and typecheck targeted files**

Run:

```bash
npm test -- src/preload/createElectronBridge.test.cjs
npm run typecheck
```

Expected: PASS for the test and no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/localProxyIpc.ts src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs src/renderer/src/types/electron.d.ts
git commit -m "feat: expose proxy doctor ipc"
```

## Task 5: Renderer View Model

**Files:**
- Create: `src/renderer/src/tools/localProxyDoctorViewModel.ts`
- Create: `src/renderer/src/tools/localProxyDoctorViewModel.test.cjs`

- [ ] **Step 1: Write failing tests for UI labels and default form conversion**

Create `src/renderer/src/tools/localProxyDoctorViewModel.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadViewModelModule() {
  const filePath = path.join(__dirname, 'localProxyDoctorViewModel.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: filePath
  }).outputText

  const module = { exports: {} }
  const customRequire = (specifier) => {
    if (specifier === '../../../shared/proxyDoctor') {
      return require(path.join(__dirname, '../../../shared/proxyDoctor.ts'))
    }
    return require(specifier)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: customRequire,
    __dirname,
    __filename: filePath,
    console,
    process
  }, { filename: filePath })

  return module.exports
}

const {
  DEFAULT_PROXY_DOCTOR_BYPASS,
  createProxyDoctorApplyRequest,
  getLayerStateTone,
  getSummaryCopy,
  splitProxyDoctorBypass
} = loadViewModelModule()

test('splitProxyDoctorBypass accepts semicolons and newlines', () => {
  assert.deepEqual(splitProxyDoctorBypass('localhost;127.*\n<local>'), ['localhost', '127.*', '<local>'])
})

test('createProxyDoctorApplyRequest normalizes target and bypass fields', () => {
  assert.deepEqual(createProxyDoctorApplyRequest(' 7897 ', 'localhost;127.*'), {
    target: '7897',
    bypass: ['localhost', '127.*']
  })
})

test('summary and layer state labels stay user-facing', () => {
  assert.equal(getSummaryCopy('unified').title, '开发代理已统一')
  assert.equal(getSummaryCopy('off').title, '开发代理未启用')
  assert.equal(getSummaryCopy('conflict').title, '代理配置存在冲突')
  assert.equal(getLayerStateTone('ok'), 'success')
  assert.equal(getLayerStateTone('conflict'), 'warning')
  assert.ok(DEFAULT_PROXY_DOCTOR_BYPASS.includes('<local>'))
})
```

- [ ] **Step 2: Run the view model test and verify it fails**

Run:

```bash
npm test -- src/renderer/src/tools/localProxyDoctorViewModel.test.cjs
```

Expected: FAIL because `localProxyDoctorViewModel.ts` does not exist.

- [ ] **Step 3: Create the view model implementation**

Create `src/renderer/src/tools/localProxyDoctorViewModel.ts`:

```ts
import type { ProxyDoctorApplyRequest, ProxyDoctorLayerState, ProxyDoctorSummary } from '../../../shared/proxyDoctor'

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
```

- [ ] **Step 4: Run the view model test and verify it passes**

Run:

```bash
npm test -- src/renderer/src/tools/localProxyDoctorViewModel.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/tools/localProxyDoctorViewModel.ts src/renderer/src/tools/localProxyDoctorViewModel.test.cjs
git commit -m "feat: add proxy doctor renderer view model"
```

## Task 6: Proxy Doctor UI

**Files:**
- Modify: `src/renderer/src/tools/LocalProxyManagerTool.tsx`

- [ ] **Step 1: Write a failing static UI contract test**

Create `src/renderer/src/tools/LocalProxyManagerTool.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, 'LocalProxyManagerTool.tsx'), 'utf8')

test('LocalProxyManagerTool presents Proxy Doctor language and actions', () => {
  assert.match(source, /代理医生/)
  assert.match(source, /一键修复开发代理/)
  assert.match(source, /清除开发代理/)
  assert.match(source, /doctorScan/)
  assert.match(source, /doctorApplyAll/)
  assert.match(source, /doctorClearLayer/)
})
```

- [ ] **Step 2: Run the static UI contract test and verify it fails**

Run:

```bash
npm test -- src/renderer/src/tools/LocalProxyManagerTool.test.cjs
```

Expected: FAIL because the current UI still says “本地代理管理” and uses old APIs only.

- [ ] **Step 3: Replace the component with the Proxy Doctor UI**

Modify `src/renderer/src/tools/LocalProxyManagerTool.tsx` so it:

- Imports `Activity`, `AlertTriangle`, `Copy`, `ExternalLink`, `Power`, `RefreshCw`, `ShieldCheck`, `Wrench` from `lucide-react`.
- Imports `ProxyDoctorLayerStatus`, `ProxyDoctorSnapshot` from `../../../shared/proxyDoctor`.
- Imports view model helpers from `./localProxyDoctorViewModel`.
- Keeps local `useState` for `snapshot`, `loading`, `target`, `bypass`, `advancedOpen`, and `log`.
- Calls `window.electron.localProxy.doctorScan(target)` on mount and refresh.
- Calls `doctorApplyAll`, `doctorClearAll`, `doctorFixLayer`, and `doctorClearLayer` from buttons.

Use this component skeleton and preserve the existing notification style:

```tsx
export default function LocalProxyManagerTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const [snapshot, setSnapshot] = useState<ProxyDoctorSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState(DEFAULT_PROXY_DOCTOR_TARGET)
  const [bypass, setBypass] = useState(DEFAULT_PROXY_DOCTOR_BYPASS.join(';'))
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const appendLog = useCallback((message: string) => {
    setLog((items) => [message, ...items].slice(0, 50))
  }, [])

  const scan = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const result = await window.electron.localProxy.doctorScan(target)
    if (result.success && result.data) {
      setSnapshot(result.data)
      appendLog(`扫描完成: ${result.data.summary}`)
    } else {
      showNotification({ type: 'error', title: '代理诊断失败', message: result.error || '无法完成代理诊断。' })
    }
    if (!silent) setLoading(false)
  }, [appendLog, showNotification, target])

  useEffect(() => {
    void scan()
  }, [scan])

  const handleApplyAll = async () => {
    if (!window.confirm('这会写入 Windows 系统代理、WinHTTP、用户环境变量、Git 和 npm 代理配置。继续吗？')) return
    setLoading(true)
    const request = createProxyDoctorApplyRequest(target, bypass)
    const result = await window.electron.localProxy.doctorApplyAll(request)
    setLoading(false)
    if (result.success && result.data) {
      setSnapshot(result.data)
      showNotification({ type: 'success', title: '代理已修复', message: '开发代理配置已按目标代理统一。' })
      appendLog('一键修复完成')
    } else {
      showNotification({ type: 'error', title: '修复失败', message: result.error || '未能完成一键修复。' })
    }
  }

  const handleClearAll = async () => {
    if (!window.confirm('这会关闭 Windows 系统代理、重置 WinHTTP，并清除用户环境变量、Git、npm 的显式代理。继续吗？')) return
    setLoading(true)
    const result = await window.electron.localProxy.doctorClearAll()
    setLoading(false)
    if (result.success) {
      showNotification({ type: 'success', title: '代理已清理', message: '开发代理配置已清除。' })
      appendLog('一键清理完成')
      await scan(true)
    } else {
      showNotification({ type: 'error', title: '清理失败', message: result.error || '未能完成代理清理。' })
    }
  }

  const handleFixLayer = async (layer: ProxyDoctorLayerStatus) => {
    const request = createProxyDoctorApplyRequest(target, bypass)
    const result = await window.electron.localProxy.doctorFixLayer(layer.id, request.target, request.bypass)
    if (result.success) {
      showNotification({ type: 'success', title: '单层修复完成', message: `${layer.title} 已修复。` })
      await scan(true)
    } else {
      showNotification({ type: 'error', title: '单层修复失败', message: result.error || `${layer.title} 未能修复。` })
    }
  }

  const handleClearLayer = async (layer: ProxyDoctorLayerStatus) => {
    const result = await window.electron.localProxy.doctorClearLayer(layer.id)
    if (result.success) {
      showNotification({ type: 'success', title: '单层清理完成', message: `${layer.title} 已清理。` })
      await scan(true)
    } else {
      showNotification({ type: 'error', title: '单层清理失败', message: result.error || `${layer.title} 未能清理。` })
    }
  }

  const summaryCopy = snapshot ? getSummaryCopy(snapshot.summary) : getSummaryCopy('off')

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <h2 className="flex items-center gap-3 text-3xl font-black tracking-tight">
            <ShieldCheck className="text-emerald-500" size={30} />
            代理医生
          </h2>
          <p className="text-sm font-bold text-muted-foreground">
            统一诊断 Windows 系统代理、WinHTTP、环境变量、Git、npm 和进程代理证据。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="rounded-2xl" onClick={() => void scan()}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新诊断
          </Button>
          <Button variant="outline" className="rounded-2xl" onClick={() => void window.electron.localProxy.openSystemSettings()}>
            <ExternalLink size={16} />
            系统设置
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-none">
        <CardContent className="grid gap-6 p-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">目标代理</label>
              <Input value={target} onChange={(event) => setTarget(event.target.value)} className="h-12 rounded-2xl font-bold" placeholder="127.0.0.1:7897" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">旁路规则</label>
              <textarea
                value={bypass}
                onChange={(event) => setBypass(event.target.value)}
                className="min-h-28 w-full rounded-3xl border border-white/20 bg-white/50 px-5 py-4 text-sm font-medium shadow-soft-sm transition-all duration-300 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:border-white/10 dark:bg-white/10"
                placeholder="localhost;127.*;<local>"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/20 hover:bg-emerald-600" onClick={() => void handleApplyAll()}>
                <Wrench size={16} />
                一键修复开发代理
              </Button>
              <Button variant="destructive" className="rounded-2xl" onClick={() => void handleClearAll()}>
                <Power size={16} />
                清除开发代理
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-500/10 bg-emerald-500/5 p-5">
            <div className="flex items-center gap-3">
              <Activity className="text-emerald-500" size={24} />
              <div>
                <div className="text-xl font-black">{summaryCopy.title}</div>
                <p className="text-sm font-bold text-muted-foreground">{summaryCopy.description}</p>
              </div>
            </div>
            <div className="mt-5 text-sm font-bold text-muted-foreground">
              端口状态：{snapshot?.portOpen ? '可连接' : '不可连接或未检测到'}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(snapshot?.layers || []).map((layer) => {
          const tone = getLayerStateTone(layer.state)
          return (
            <Card key={layer.id} className="overflow-hidden border-none">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg font-black">{layer.title}</CardTitle>
                    <CardDescription>{layer.detail}</CardDescription>
                  </div>
                  <Badge variant="outline" className={cn(
                    'shrink-0 px-3 py-1 text-[11px] font-black',
                    tone === 'success' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
                    tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-600',
                    tone === 'danger' && 'border-red-500/20 bg-red-500/10 text-red-600',
                    tone === 'muted' && 'border-zinc-300/60 bg-zinc-500/5 text-zinc-500'
                  )}>
                    {getLayerStateLabel(layer.state)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-muted/40 p-4 font-mono text-xs text-muted-foreground">
                  {layer.currentValue || '未设置'}
                </div>
                <div className="text-xs font-bold text-muted-foreground">{layer.actionHint}</div>
                <div className="flex flex-wrap gap-2">
                  {layer.canFix && (
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void handleFixLayer(layer)}>修复此层</Button>
                  )}
                  {layer.canClear && (
                    <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => void handleClearLayer(layer)}>清除此层</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="overflow-hidden border-none">
        <CardHeader>
          <button className="flex w-full items-center justify-between text-left" onClick={() => setAdvancedOpen((value) => !value)}>
            <CardTitle className="text-xl font-black">高级日志与报告</CardTitle>
            <AlertTriangle size={18} className="text-muted-foreground" />
          </button>
        </CardHeader>
        {advancedOpen && (
          <CardContent className="space-y-4">
            <Button variant="outline" className="rounded-2xl" disabled={!snapshot?.reportText} onClick={() => void navigator.clipboard.writeText(snapshot?.reportText || '')}>
              <Copy size={16} />
              复制诊断报告
            </Button>
            <pre className="max-h-72 overflow-auto rounded-3xl bg-zinc-950 p-4 text-xs text-zinc-100">{snapshot?.reportText || log.join('\n')}</pre>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Run UI contract and typecheck**

Run:

```bash
npm test -- src/renderer/src/tools/LocalProxyManagerTool.test.cjs
npm run typecheck:web
```

Expected: PASS for the test and no web type errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/tools/LocalProxyManagerTool.tsx src/renderer/src/tools/LocalProxyManagerTool.test.cjs
git commit -m "feat: redesign local proxy tool as proxy doctor"
```

## Task 7: Tool Metadata and Route Contracts

**Files:**
- Modify: `src/renderer/src/data/tools.ts`
- Modify: `src/renderer/src/data/toolComponents.ts`
- Modify: `src/renderer/src/appRouting.test.cjs`

- [ ] **Step 1: Write failing metadata assertion**

Append to `src/renderer/src/appRouting.test.cjs`:

```js
test('local proxy manager keeps its route id while adopting Proxy Doctor naming', () => {
  const proxyTool = actualTools.find((tool) => tool.id === 'local-proxy-manager')

  assert.equal(proxyTool.id, 'local-proxy-manager')
  assert.equal(proxyTool.name, '代理医生')
  assert.match(proxyTool.description, /系统代理|Git|npm/)
})
```

- [ ] **Step 2: Run route test and verify it fails**

Run:

```bash
npm test -- src/renderer/src/appRouting.test.cjs
```

Expected: FAIL because the tool is still named “本地代理”.

- [ ] **Step 3: Update metadata while preserving IDs**

Modify the `local-proxy-manager` entry in `src/renderer/src/data/tools.ts`:

```ts
  {
    id: 'local-proxy-manager',
    name: '代理医生',
    description: '诊断并统一 Windows 系统代理、WinHTTP、Git、npm 与命令行代理',
    category: '系统维护',
    icon: 'ShieldCheck',
    componentPath: 'LocalProxyManagerTool'
  },
```

Modify the `local-proxy-manager` entry in `src/renderer/src/data/toolComponents.ts`:

```ts
  {
    id: 'local-proxy-manager',
    name: '代理医生',
    description: '一键诊断并修复系统代理、WinHTTP、Git、npm 与开发环境代理冲突',
    category: '网络工具',
    size: 1,
    version: '1.1.0',
    icon: 'ShieldCheck',
    installed: true
  },
```

- [ ] **Step 4: Run route test and verify it passes**

Run:

```bash
npm test -- src/renderer/src/appRouting.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/data/tools.ts src/renderer/src/data/toolComponents.ts src/renderer/src/appRouting.test.cjs
git commit -m "feat: rename local proxy tool to proxy doctor"
```

## Task 8: Full Verification and Cleanup

**Files:**
- Verify all modified files from prior tasks.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/shared/proxyDoctor.test.cjs src/main/services/LocalProxyService.test.cjs src/preload/createElectronBridge.test.cjs src/renderer/src/tools/localProxyDoctorViewModel.test.cjs src/renderer/src/tools/LocalProxyManagerTool.test.cjs src/renderer/src/appRouting.test.cjs
```

Expected: all listed tests PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: node and web TypeScript checks PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: Electron Vite build exits 0.

- [ ] **Step 5: Review git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended Proxy Doctor files are changed and there are no generated artifacts.

- [ ] **Step 6: Commit final verification notes if any documentation changed**

If no files changed during verification, do not create an empty commit. If verification required correcting docs or tests, commit those changes:

```bash
git add <changed-files>
git commit -m "test: verify proxy doctor integration"
```

Expected: either no commit is created because the worktree is clean, or the commit contains only verification-related corrections.
