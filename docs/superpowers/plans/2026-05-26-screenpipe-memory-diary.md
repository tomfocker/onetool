# ScreenPipe Memory Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ScreenPipe-powered `记忆日报` tool with semi-automatic ScreenPipe management, privacy-aware daily timeline aggregation, AI-generated Markdown diary drafts, and saved diary history.

**Architecture:** Add focused shared models first, then build main-process services around a ScreenPipe API client, a ScreenPipe CLI/process manager, a timeline aggregation service, and a diary generation service. Expose those services through IPC and preload, then add a renderer tool page that follows the existing tool registry and route-map patterns.

**Tech Stack:** Electron 33, TypeScript, React 18, existing Node `node:test` + TypeScript transpile test pattern, existing OpenAI-compatible LLM client, ScreenPipe local REST API at `localhost:3030`.

---

## File Structure

Create or modify these files:

- Create `src/shared/memoryDiary.ts`: shared config, status, timeline, diary, and helper functions.
- Modify `src/shared/types.ts`: add `MemoryDiaryStoredState` to `GlobalStore`.
- Modify `src/shared/storeSchema.ts`: create and migrate default memory diary store state.
- Create `src/shared/memoryDiary.test.cjs`: shared helper tests.
- Create `src/main/services/ScreenpipeClient.ts`: REST client for `/health` and `/search`.
- Create `src/main/services/ScreenpipeClient.test.cjs`: client tests with fake fetch.
- Create `src/main/services/ScreenpipeManagementService.ts`: CLI detection, version, token, start/stop, logs, persisted config.
- Create `src/main/services/ScreenpipeManagementService.test.cjs`: CLI/process manager tests with fake dependencies.
- Create `src/main/services/MemoryTimelineService.ts`: query ScreenPipe and aggregate daily timeline buckets.
- Create `src/main/services/MemoryTimelineService.test.cjs`: timeline service tests.
- Create `src/main/services/llmAdapters/MemoryDiaryAdapter.ts`: prompt builder and diary result normalizer.
- Create `src/main/services/llmAdapters/MemoryDiaryAdapter.test.cjs`: adapter tests.
- Modify `src/main/services/LlmService.ts`: add memory diary generation method.
- Modify `src/main/ipc/llmIpc.ts`: add LLM handler only if generation stays under LLM IPC; otherwise use memory diary IPC.
- Create `src/main/services/MemoryDiaryService.ts`: generate/save/list/delete diary files and history index.
- Create `src/main/services/MemoryDiaryService.test.cjs`: diary history and Markdown storage tests.
- Create `src/main/ipc/memoryDiaryIpc.ts`: all memory diary IPC handlers.
- Create `src/main/ipc/memoryDiaryIpc.test.cjs`: IPC registration tests.
- Modify `src/main/bootstrap/registerIpc.ts`: register `registerMemoryDiaryIpc`.
- Modify `src/main/bootstrap/registerIpc.test.cjs`: expect memory diary registrar.
- Modify `src/main/index.ts`: import and pass `registerMemoryDiaryIpc`.
- Modify `src/preload/createElectronBridge.ts`: expose `window.electron.memoryDiary`.
- Modify `src/preload/createElectronBridge.test.cjs`: verify bridge methods if existing tests cover bridge shape.
- Create `src/renderer/src/tools/MemoryDiaryTool.tsx`: the tool UI.
- Modify `src/renderer/src/types/electron.d.ts`: add memory diary bridge type.
- Modify `src/renderer/src/data/tools.ts`: add `memory-diary` tool.
- Modify `src/renderer/src/appRouting.test.cjs`: verify route map exposes the tool.
- Optional create `src/renderer/src/tools/memoryDiaryViewModel.ts`: pure UI view-model helpers if `MemoryDiaryTool.tsx` grows past simple state wiring.
- Optional create `src/renderer/src/tools/memoryDiaryViewModel.test.cjs`: renderer pure helper tests.

## Task 1: Shared Model And Store Defaults

**Files:**
- Create: `src/shared/memoryDiary.ts`
- Create: `src/shared/memoryDiary.test.cjs`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/storeSchema.ts`

- [ ] **Step 1: Write shared helper tests**

Create `src/shared/memoryDiary.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const memoryDiary = require(path.join(__dirname, 'memoryDiary.ts'))

test('createDefaultMemoryDiaryStoredState uses privacy-conservative defaults', () => {
  const state = memoryDiary.createDefaultMemoryDiaryStoredState()

  assert.equal(state.config.apiUrl, 'http://localhost:3030')
  assert.equal(state.config.includeAudio, false)
  assert.equal(state.config.includeInput, false)
  assert.deepEqual(state.config.enabledContentTypes, ['accessibility', 'ocr'])
  assert.equal(state.config.timelineBucketMinutes, 15)
  assert.equal(state.diaryHistory.length, 0)
})

test('filterMemoryDiaryItems removes disabled content types and sensitive windows', () => {
  const config = {
    ...memoryDiary.createDefaultMemoryDiaryConfig(),
    sensitiveAppPatterns: ['1Password'],
    sensitiveWindowPatterns: ['支付', 'password']
  }
  const items = [
    { id: '1', timestamp: '2026-05-26T01:00:00.000Z', contentType: 'ocr', appName: 'Code', windowName: 'README.md', url: '', text: 'implemented timeline' },
    { id: '2', timestamp: '2026-05-26T01:01:00.000Z', contentType: 'audio', appName: 'Meet', windowName: 'Standup', url: '', text: 'private call' },
    { id: '3', timestamp: '2026-05-26T01:02:00.000Z', contentType: 'ocr', appName: '1Password', windowName: 'Vault', url: '', text: 'secret' },
    { id: '4', timestamp: '2026-05-26T01:03:00.000Z', contentType: 'accessibility', appName: 'Chrome', windowName: '支付页面', url: '', text: 'secret' }
  ]

  assert.deepEqual(memoryDiary.filterMemoryDiaryItems(items, config).map((item) => item.id), ['1'])
})

test('createMemoryDiaryBucketStart floors timestamps to bucket boundaries', () => {
  assert.equal(
    memoryDiary.createMemoryDiaryBucketStart('2026-05-26T09:17:32.000+08:00', 15),
    '2026-05-26T01:15:00.000Z'
  )
})
```

- [ ] **Step 2: Run the new shared test and verify it fails**

Run: `node --test src/shared/memoryDiary.test.cjs`

Expected: FAIL with a module-not-found error for `src/shared/memoryDiary.ts`.

- [ ] **Step 3: Add shared types and helpers**

Create `src/shared/memoryDiary.ts`:

```ts
export type MemoryDiaryContentType = 'accessibility' | 'ocr' | 'audio' | 'input'
export type MemoryDiaryManagedProcessState = 'unknown' | 'not-installed' | 'stopped' | 'running' | 'external-running' | 'starting' | 'stopping' | 'error'
export type MemoryDiaryTaskState = 'idle' | 'running' | 'success' | 'error'

export interface MemoryDiaryConfig {
  apiUrl: string
  apiKey: string
  enabledContentTypes: MemoryDiaryContentType[]
  includeAudio: boolean
  includeInput: boolean
  sensitiveAppPatterns: string[]
  sensitiveWindowPatterns: string[]
  timelineBucketMinutes: 5 | 15 | 30 | 60
  diaryStyle: 'brief' | 'worklog' | 'blog'
}

export interface MemoryDiaryCliStatus {
  installed: boolean
  version: string | null
  executablePath: string | null
  error: string | null
}

export interface MemoryDiaryRuntimeStatus {
  state: MemoryDiaryManagedProcessState
  apiReachable: boolean
  apiUrl: string
  apiKeyConfigured: boolean
  lastCaptureAt: string | null
  todayItemCount: number
  contentTypeCounts: Record<MemoryDiaryContentType, number>
  message: string | null
}

export interface MemoryDiaryDeploymentLog {
  id: string
  timestamp: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export interface MemoryDiaryItem {
  id: string
  timestamp: string
  contentType: MemoryDiaryContentType
  appName: string
  windowName: string
  url: string
  text: string
}

export interface MemoryDiaryTimelineBucket {
  id: string
  start: string
  end: string
  title: string
  summary: string
  appNames: string[]
  windowNames: string[]
  urls: string[]
  contentTypes: MemoryDiaryContentType[]
  keyTexts: string[]
  items: MemoryDiaryItem[]
}

export interface MemoryDiaryGenerateRequest {
  date: string
  timezone: string
  buckets: MemoryDiaryTimelineBucket[]
  config: MemoryDiaryConfig
  userNotes: string
}

export interface MemoryDiaryGenerateResult {
  id: string
  date: string
  title: string
  markdown: string
  summary: string
  createdAt: string
}

export interface MemoryDiaryHistoryEntry {
  id: string
  date: string
  title: string
  summary: string
  markdownPath: string
  createdAt: string
  updatedAt: string
}

export interface MemoryDiaryStoredState {
  config: MemoryDiaryConfig
  diaryHistory: MemoryDiaryHistoryEntry[]
  deploymentLogs: MemoryDiaryDeploymentLog[]
}

export function createDefaultMemoryDiaryConfig(): MemoryDiaryConfig {
  return {
    apiUrl: 'http://localhost:3030',
    apiKey: '',
    enabledContentTypes: ['accessibility', 'ocr'],
    includeAudio: false,
    includeInput: false,
    sensitiveAppPatterns: ['1Password', 'Bitwarden', 'KeePass'],
    sensitiveWindowPatterns: ['password', 'login', '支付', '密码'],
    timelineBucketMinutes: 15,
    diaryStyle: 'worklog'
  }
}

export function createDefaultMemoryDiaryStoredState(): MemoryDiaryStoredState {
  return {
    config: createDefaultMemoryDiaryConfig(),
    diaryHistory: [],
    deploymentLogs: []
  }
}

function matchesAnyPattern(value: string, patterns: string[]): boolean {
  const normalizedValue = value.toLowerCase()
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.trim().toLowerCase()
    return normalizedPattern.length > 0 && normalizedValue.includes(normalizedPattern)
  })
}

export function getAllowedMemoryDiaryContentTypes(config: MemoryDiaryConfig): MemoryDiaryContentType[] {
  const allowed = new Set<MemoryDiaryContentType>(config.enabledContentTypes)
  if (config.includeAudio) allowed.add('audio')
  else allowed.delete('audio')
  if (config.includeInput) allowed.add('input')
  else allowed.delete('input')
  return Array.from(allowed)
}

export function filterMemoryDiaryItems(items: MemoryDiaryItem[], config: MemoryDiaryConfig): MemoryDiaryItem[] {
  const allowedTypes = new Set(getAllowedMemoryDiaryContentTypes(config))
  return items.filter((item) => {
    if (!allowedTypes.has(item.contentType)) return false
    if (matchesAnyPattern(item.appName, config.sensitiveAppPatterns)) return false
    if (matchesAnyPattern(item.windowName, config.sensitiveWindowPatterns)) return false
    return item.text.trim().length > 0
  })
}

export function createMemoryDiaryBucketStart(timestamp: string, bucketMinutes: number): string {
  const date = new Date(timestamp)
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000
  const bucketStartMs = Math.floor(date.getTime() / bucketMs) * bucketMs
  return new Date(bucketStartMs).toISOString()
}
```

- [ ] **Step 4: Add store types and defaults**

Modify `src/shared/types.ts`:

```ts
import type { MemoryDiaryStoredState } from './memoryDiary'
```

Add to `GlobalStore`:

```ts
memoryDiary: MemoryDiaryStoredState
```

Modify `src/shared/storeSchema.ts`:

```ts
import { createDefaultMemoryDiaryStoredState } from './memoryDiary'
```

Add to `createDefaultGlobalStore`:

```ts
memoryDiary: createDefaultMemoryDiaryStoredState(),
```

Add to `migrateGlobalStore` return value:

```ts
memoryDiary: {
  ...createDefaultMemoryDiaryStoredState(),
  ...(parsed.memoryDiary || {}),
  config: {
    ...createDefaultMemoryDiaryStoredState().config,
    ...(parsed.memoryDiary?.config || {})
  },
  diaryHistory: Array.isArray(parsed.memoryDiary?.diaryHistory) ? parsed.memoryDiary.diaryHistory : [],
  deploymentLogs: Array.isArray(parsed.memoryDiary?.deploymentLogs) ? parsed.memoryDiary.deploymentLogs : []
}
```

- [ ] **Step 5: Run shared tests**

Run: `node --test src/shared/memoryDiary.test.cjs src/shared/storeSchema.test.cjs`

Expected: PASS.

- [ ] **Step 6: Commit shared model**

```bash
git add src/shared/memoryDiary.ts src/shared/memoryDiary.test.cjs src/shared/types.ts src/shared/storeSchema.ts
git commit -m "feat: add memory diary shared model"
```

## Task 2: ScreenPipe REST Client

**Files:**
- Create: `src/main/services/ScreenpipeClient.ts`
- Create: `src/main/services/ScreenpipeClient.test.cjs`

- [ ] **Step 1: Write client tests**

Create `src/main/services/ScreenpipeClient.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule() {
  const filePath = path.join(__dirname, 'ScreenpipeClient.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filePath
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(transpiled, { module, exports: module.exports, require, __dirname, __filename: filePath, console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout }, { filename: filePath })
  return module.exports
}

test('health calls the configured api url with x-api-key', async () => {
  const calls = []
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async (url, init) => {
      calls.push([url, init.headers])
      return { ok: true, json: async () => ({ status: 'ok' }) }
    }
  })

  const result = await client.health({ apiUrl: 'http://localhost:3030', apiKey: 'token' })

  assert.equal(result.success, true)
  assert.equal(calls[0][0], 'http://localhost:3030/health')
  assert.equal(calls[0][1]['x-api-key'], 'token')
})

test('search normalizes screenpipe payload items into MemoryDiaryItem records', async () => {
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            type: 'OCR',
            content: { frame_id: 42, text: 'Implemented timeline', app_name: 'Code', window_name: 'memoryDiary.ts', timestamp: '2026-05-26T01:00:00.000Z' }
          },
          {
            type: 'Accessibility',
            content: { id: 'a1', text: 'Reviewed docs', app_name: 'Chrome', window_name: 'ScreenPipe docs', browser_url: 'https://docs.screenpi.pe', timestamp: '2026-05-26T01:15:00.000Z' }
          }
        ]
      })
    })
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'token',
    startTime: '2026-05-26T00:00:00.000Z',
    endTime: '2026-05-26T23:59:59.999Z',
    contentTypes: ['ocr', 'accessibility']
  })

  assert.equal(result.success, true)
  assert.deepEqual(result.data.map((item) => [item.id, item.contentType, item.appName, item.url, item.text]), [
    ['ocr-42', 'ocr', 'Code', '', 'Implemented timeline'],
    ['accessibility-a1', 'accessibility', 'Chrome', 'https://docs.screenpi.pe', 'Reviewed docs']
  ])
})

test('search reports non-ok responses as user-readable errors', async () => {
  const { ScreenpipeClient } = loadModule()
  const client = new ScreenpipeClient({
    fetch: async () => ({ ok: false, status: 401, text: async () => 'invalid api key' })
  })

  const result = await client.search({
    apiUrl: 'http://localhost:3030',
    apiKey: 'bad',
    startTime: '2026-05-26T00:00:00.000Z',
    endTime: '2026-05-26T23:59:59.999Z',
    contentTypes: ['ocr']
  })

  assert.equal(result.success, false)
  assert.match(result.error, /401/)
})
```

- [ ] **Step 2: Run client tests and verify failure**

Run: `node --test src/main/services/ScreenpipeClient.test.cjs`

Expected: FAIL with module-not-found for `ScreenpipeClient.ts`.

- [ ] **Step 3: Implement the client**

Create `src/main/services/ScreenpipeClient.ts`:

```ts
import type { IpcResponse } from '../../shared/types'
import type { MemoryDiaryContentType, MemoryDiaryItem } from '../../shared/memoryDiary'

type FetchLike = typeof fetch

export interface ScreenpipeConnectionConfig {
  apiUrl: string
  apiKey: string
}

export interface ScreenpipeSearchRequest extends ScreenpipeConnectionConfig {
  startTime: string
  endTime: string
  contentTypes: MemoryDiaryContentType[]
  limit?: number
}

type ScreenpipePayloadItem = {
  type?: string
  content?: Record<string, unknown>
}

export class ScreenpipeClient {
  private readonly fetchImpl: FetchLike

  constructor(dependencies: { fetch?: FetchLike } = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch
  }

  async health(config: ScreenpipeConnectionConfig): Promise<IpcResponse<{ status: string }>> {
    try {
      const response = await this.fetchImpl(this.buildUrl(config.apiUrl, '/health'), {
        headers: this.buildHeaders(config.apiKey)
      })
      if (!response.ok) return { success: false, error: await this.readError(response, 'ScreenPipe 健康检查失败') }
      const payload = await response.json() as { status?: string }
      return { success: true, data: { status: payload.status || 'ok' } }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  async search(request: ScreenpipeSearchRequest): Promise<IpcResponse<MemoryDiaryItem[]>> {
    try {
      const params = new URLSearchParams()
      params.set('start_time', request.startTime)
      params.set('end_time', request.endTime)
      params.set('limit', String(request.limit ?? 1000))
      params.set('content_type', request.contentTypes.length === 1 ? request.contentTypes[0] : 'all')
      const response = await this.fetchImpl(`${this.buildUrl(request.apiUrl, '/search')}?${params.toString()}`, {
        headers: this.buildHeaders(request.apiKey)
      })
      if (!response.ok) return { success: false, error: await this.readError(response, 'ScreenPipe 搜索失败') }
      const payload = await response.json() as { data?: ScreenpipePayloadItem[] }
      return { success: true, data: (payload.data || []).map((item, index) => this.mapItem(item, index)).filter(Boolean) as MemoryDiaryItem[] }
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) }
    }
  }

  private buildUrl(apiUrl: string, path: string): string {
    return `${apiUrl.replace(/\/$/, '')}${path}`
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey.trim()) headers['x-api-key'] = apiKey.trim()
    return headers
  }

  private async readError(response: Response, fallback: string): Promise<string> {
    try {
      const body = await response.text()
      return `${fallback} (${response.status})${body ? `: ${body.slice(0, 160)}` : ''}`
    } catch {
      return `${fallback} (${response.status})`
    }
  }

  private mapItem(item: ScreenpipePayloadItem, index: number): MemoryDiaryItem | null {
    const content = item.content || {}
    const contentType = this.mapContentType(item.type)
    const text = String(content.text ?? content.transcription ?? '').trim()
    const timestamp = String(content.timestamp ?? content.created_at ?? '')
    if (!contentType || !text || !timestamp) return null
    const rawId = String(content.id ?? content.frame_id ?? content.chunk_id ?? index)
    return {
      id: `${contentType}-${rawId}`,
      timestamp,
      contentType,
      appName: String(content.app_name ?? content.appName ?? ''),
      windowName: String(content.window_name ?? content.windowName ?? ''),
      url: String(content.browser_url ?? content.url ?? ''),
      text
    }
  }

  private mapContentType(input: unknown): MemoryDiaryContentType | null {
    const normalized = String(input ?? '').toLowerCase()
    if (normalized.includes('accessibility')) return 'accessibility'
    if (normalized.includes('ocr')) return 'ocr'
    if (normalized.includes('audio')) return 'audio'
    if (normalized.includes('input')) return 'input'
    return null
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const screenpipeClient = new ScreenpipeClient()
```

- [ ] **Step 4: Run client tests**

Run: `node --test src/main/services/ScreenpipeClient.test.cjs`

Expected: PASS.

- [ ] **Step 5: Commit client**

```bash
git add src/main/services/ScreenpipeClient.ts src/main/services/ScreenpipeClient.test.cjs
git commit -m "feat: add screenpipe api client"
```

## Task 3: ScreenPipe Management Service And IPC

**Files:**
- Create: `src/main/services/ScreenpipeManagementService.ts`
- Create: `src/main/services/ScreenpipeManagementService.test.cjs`
- Create: `src/main/ipc/memoryDiaryIpc.ts`
- Create: `src/main/ipc/memoryDiaryIpc.test.cjs`
- Modify: `src/main/bootstrap/registerIpc.ts`
- Modify: `src/main/bootstrap/registerIpc.test.cjs`
- Modify: `src/main/index.ts`
- Modify: `src/preload/createElectronBridge.ts`

- [ ] **Step 1: Write management service tests**

Create tests that cover these exact behaviors in `src/main/services/ScreenpipeManagementService.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadModule(overrides = {}) {
  const filePath = path.join(__dirname, 'ScreenpipeManagementService.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filePath
  }).outputText
  const module = { exports: {} }
  const customRequire = (specifier) => {
    if (specifier === 'child_process') return overrides.childProcess
    if (specifier === './StoreService') return { storeService: overrides.storeService }
    if (specifier === '../../shared/memoryDiary') return require(path.join(__dirname, '../../shared/memoryDiary.ts'))
    if (specifier === '../../shared/types') return {}
    return require(specifier)
  }
  vm.runInNewContext(transpiled, { module, exports: module.exports, require: customRequire, __dirname, __filename: filePath, console, Buffer, setTimeout, clearTimeout }, { filename: filePath })
  return module.exports
}

test('getCliStatus reports installed version from screenpipe --version', async () => {
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (cmd, args, cb) => cb(null, { stdout: 'screenpipe 1.2.3\n', stderr: '' }),
      spawn: () => { throw new Error('not used') }
    },
    storeService: { get: () => ({ config: {}, deploymentLogs: [] }), set() {} }
  })
  const service = new ScreenpipeManagementService()
  const result = await service.getCliStatus()
  assert.equal(result.success, true)
  assert.equal(result.data.installed, true)
  assert.equal(result.data.version, 'screenpipe 1.2.3')
})

test('getAuthToken runs screenpipe auth token and stores api key', async () => {
  const writes = []
  const state = { memoryDiary: { config: { apiUrl: 'http://localhost:3030', apiKey: '' }, deploymentLogs: [], diaryHistory: [] } }
  const { ScreenpipeManagementService } = loadModule({
    childProcess: {
      execFile: (cmd, args, cb) => cb(null, { stdout: 'secret-token\n', stderr: '' }),
      spawn: () => { throw new Error('not used') }
    },
    storeService: {
      get: (key) => state[key],
      set: (key, value) => { writes.push([key, value]); state[key] = value }
    }
  })
  const service = new ScreenpipeManagementService()
  const result = await service.getAuthToken()
  assert.equal(result.success, true)
  assert.equal(result.data.apiKey, 'secret-token')
  assert.equal(writes.at(-1)[1].config.apiKey, 'secret-token')
})
```

- [ ] **Step 2: Run management tests and verify failure**

Run: `node --test src/main/services/ScreenpipeManagementService.test.cjs`

Expected: FAIL because `ScreenpipeManagementService.ts` does not exist.

- [ ] **Step 3: Implement management service**

Create `src/main/services/ScreenpipeManagementService.ts` with:

```ts
import { execFile, spawn, type ChildProcess } from 'child_process'
import type { IpcResponse } from '../../shared/types'
import type { MemoryDiaryDeploymentLog, MemoryDiaryRuntimeStatus, MemoryDiaryStoredState } from '../../shared/memoryDiary'
import { createDefaultMemoryDiaryStoredState } from '../../shared/memoryDiary'
import { storeService } from './StoreService'

type ExecFileResult = { stdout: string; stderr: string }

export class ScreenpipeManagementService {
  private managedProcess: ChildProcess | null = null

  getStoredState(): MemoryDiaryStoredState {
    return storeService.get('memoryDiary') || createDefaultMemoryDiaryStoredState()
  }

  async getCliStatus(): Promise<IpcResponse<{ installed: boolean; version: string | null; executablePath: string | null; error: string | null }>> {
    try {
      const result = await this.execScreenpipe(['--version'])
      return { success: true, data: { installed: true, version: result.stdout.trim() || null, executablePath: 'screenpipe', error: null } }
    } catch (error) {
      return { success: true, data: { installed: false, version: null, executablePath: null, error: this.toErrorMessage(error) } }
    }
  }

  async getAuthToken(): Promise<IpcResponse<{ apiKey: string }>> {
    try {
      const result = await this.execScreenpipe(['auth', 'token'])
      const apiKey = result.stdout.trim()
      if (!apiKey) return { success: false, error: 'ScreenPipe 没有返回 API Key' }
      const state = this.getStoredState()
      this.saveState({ ...state, config: { ...state.config, apiKey } })
      this.appendLog('success', '已获取 ScreenPipe API Key')
      return { success: true, data: { apiKey } }
    } catch (error) {
      const message = this.toErrorMessage(error)
      this.appendLog('error', `获取 ScreenPipe API Key 失败：${message}`)
      return { success: false, error: message }
    }
  }

  async start(): Promise<IpcResponse<MemoryDiaryRuntimeStatus>> {
    if (this.managedProcess) return { success: false, error: 'ScreenPipe 已由 onetool 启动' }
    try {
      this.managedProcess = spawn('screenpipe', ['record'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      this.appendLog('info', '已启动 ScreenPipe record 进程')
      this.managedProcess.on('close', () => { this.managedProcess = null })
      return { success: true, data: this.createRuntimeStatus('starting', 'ScreenPipe 正在启动') }
    } catch (error) {
      const message = this.toErrorMessage(error)
      this.appendLog('error', `启动 ScreenPipe 失败：${message}`)
      return { success: false, error: message }
    }
  }

  async stop(): Promise<IpcResponse<MemoryDiaryRuntimeStatus>> {
    if (!this.managedProcess) return { success: false, error: '当前没有由 onetool 托管的 ScreenPipe 进程' }
    this.managedProcess.kill()
    this.managedProcess = null
    this.appendLog('info', '已停止 onetool 托管的 ScreenPipe 进程')
    return { success: true, data: this.createRuntimeStatus('stopped', 'ScreenPipe 已停止') }
  }

  updateConfig(updates: Partial<MemoryDiaryStoredState['config']>): IpcResponse<MemoryDiaryStoredState> {
    const state = this.getStoredState()
    const nextState = { ...state, config: { ...state.config, ...updates } }
    this.saveState(nextState)
    return { success: true, data: nextState }
  }

  getLogs(): IpcResponse<MemoryDiaryDeploymentLog[]> {
    return { success: true, data: this.getStoredState().deploymentLogs }
  }

  private createRuntimeStatus(state: MemoryDiaryRuntimeStatus['state'], message: string): MemoryDiaryRuntimeStatus {
    const stored = this.getStoredState()
    return {
      state,
      apiReachable: false,
      apiUrl: stored.config.apiUrl,
      apiKeyConfigured: stored.config.apiKey.trim().length > 0,
      lastCaptureAt: null,
      todayItemCount: 0,
      contentTypeCounts: { accessibility: 0, ocr: 0, audio: 0, input: 0 },
      message
    }
  }

  private execScreenpipe(args: string[]): Promise<ExecFileResult> {
    return new Promise((resolve, reject) => {
      execFile('screenpipe', args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) reject(error)
        else resolve({ stdout: String(stdout), stderr: String(stderr) })
      })
    })
  }

  private appendLog(level: MemoryDiaryDeploymentLog['level'], message: string): void {
    const state = this.getStoredState()
    this.saveState({
      ...state,
      deploymentLogs: [
        { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, timestamp: new Date().toISOString(), level, message },
        ...state.deploymentLogs
      ].slice(0, 80)
    })
  }

  private saveState(state: MemoryDiaryStoredState): void {
    storeService.set('memoryDiary', state)
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const screenpipeManagementService = new ScreenpipeManagementService()
```

- [ ] **Step 4: Run management tests**

Run: `node --test src/main/services/ScreenpipeManagementService.test.cjs`

Expected: PASS.

- [ ] **Step 5: Write IPC tests**

Create `src/main/ipc/memoryDiaryIpc.test.cjs` following `downloadOrganizerIpc.test.cjs` style. Test at least:

```js
test('registerMemoryDiaryIpc wires status, config, start, stop, token and logs handlers', async () => {
  const { registerMemoryDiaryIpc, handlers } = loadMemoryDiaryIpcModule({
    managementService: {
      getCliStatus: async () => ({ success: true, data: { installed: true } }),
      updateConfig: (updates) => ({ success: true, data: { config: updates } }),
      start: async () => ({ success: true, data: { state: 'starting' } }),
      stop: async () => ({ success: true, data: { state: 'stopped' } }),
      getAuthToken: async () => ({ success: true, data: { apiKey: 'token' } }),
      getLogs: () => ({ success: true, data: [] })
    },
    timelineService: { queryTimeline: async () => ({ success: true, data: [] }) },
    diaryService: {
      generate: async () => ({ success: true, data: { markdown: '# diary' } }),
      list: () => ({ success: true, data: [] }),
      save: async () => ({ success: true, data: {} }),
      delete: async () => ({ success: true })
    }
  })

  registerMemoryDiaryIpc()
  assert.equal((await handlers['memory-screenpipe-get-cli-status']()).success, true)
  assert.equal((await handlers['memory-screenpipe-start']()).data.state, 'starting')
  assert.equal((await handlers['memory-screenpipe-get-token']()).data.apiKey, 'token')
})
```

- [ ] **Step 6: Implement IPC**

Create `src/main/ipc/memoryDiaryIpc.ts`:

```ts
import { ipcMain } from 'electron'
import { screenpipeManagementService } from '../services/ScreenpipeManagementService'
import { memoryTimelineService } from '../services/MemoryTimelineService'
import { memoryDiaryService } from '../services/MemoryDiaryService'

export function registerMemoryDiaryIpc() {
  ipcMain.handle('memory-screenpipe-get-cli-status', async () => screenpipeManagementService.getCliStatus())
  ipcMain.handle('memory-screenpipe-update-config', async (_event, updates) => screenpipeManagementService.updateConfig(updates))
  ipcMain.handle('memory-screenpipe-start', async () => screenpipeManagementService.start())
  ipcMain.handle('memory-screenpipe-stop', async () => screenpipeManagementService.stop())
  ipcMain.handle('memory-screenpipe-get-token', async () => screenpipeManagementService.getAuthToken())
  ipcMain.handle('memory-screenpipe-get-logs', async () => screenpipeManagementService.getLogs())
  ipcMain.handle('memory-timeline-query', async (_event, request) => memoryTimelineService.queryTimeline(request))
  ipcMain.handle('memory-diary-generate', async (_event, request) => memoryDiaryService.generate(request))
  ipcMain.handle('memory-diary-list', async () => memoryDiaryService.list())
  ipcMain.handle('memory-diary-save', async (_event, request) => memoryDiaryService.save(request))
  ipcMain.handle('memory-diary-delete', async (_event, id) => memoryDiaryService.delete(id))
}
```

- [ ] **Step 7: Register IPC and preload bridge**

Modify `src/main/bootstrap/registerIpc.ts` type and call list:

```ts
registerMemoryDiaryIpc(): void
```

```ts
registrars.registerMemoryDiaryIpc()
```

Modify `src/main/index.ts`:

```ts
import { registerMemoryDiaryIpc } from './ipc/memoryDiaryIpc'
```

Add to `registerMainProcessIpc` registrars:

```ts
registerMemoryDiaryIpc,
```

Modify `src/preload/createElectronBridge.ts` and add:

```ts
const memoryDiaryAPI = {
  getCliStatus: () => ipcRenderer.invoke('memory-screenpipe-get-cli-status'),
  updateConfig: (updates: any) => ipcRenderer.invoke('memory-screenpipe-update-config', updates),
  startScreenpipe: () => ipcRenderer.invoke('memory-screenpipe-start'),
  stopScreenpipe: () => ipcRenderer.invoke('memory-screenpipe-stop'),
  getToken: () => ipcRenderer.invoke('memory-screenpipe-get-token'),
  getLogs: () => ipcRenderer.invoke('memory-screenpipe-get-logs'),
  queryTimeline: (request: any) => ipcRenderer.invoke('memory-timeline-query', request),
  generateDiary: (request: any) => ipcRenderer.invoke('memory-diary-generate', request),
  listDiaries: () => ipcRenderer.invoke('memory-diary-list'),
  saveDiary: (request: any) => ipcRenderer.invoke('memory-diary-save', request),
  deleteDiary: (id: string) => ipcRenderer.invoke('memory-diary-delete', id)
}
```

Return it:

```ts
memoryDiary: memoryDiaryAPI,
```

- [ ] **Step 8: Run IPC tests**

Run: `node --test src/main/services/ScreenpipeManagementService.test.cjs src/main/ipc/memoryDiaryIpc.test.cjs src/main/bootstrap/registerIpc.test.cjs`

Expected: PASS.

- [ ] **Step 9: Commit management and IPC**

```bash
git add src/main/services/ScreenpipeManagementService.ts src/main/services/ScreenpipeManagementService.test.cjs src/main/ipc/memoryDiaryIpc.ts src/main/ipc/memoryDiaryIpc.test.cjs src/main/bootstrap/registerIpc.ts src/main/bootstrap/registerIpc.test.cjs src/main/index.ts src/preload/createElectronBridge.ts
git commit -m "feat: add screenpipe management ipc"
```

## Task 4: Timeline Aggregation Service

**Files:**
- Create: `src/main/services/MemoryTimelineService.ts`
- Create: `src/main/services/MemoryTimelineService.test.cjs`

- [ ] **Step 1: Write timeline service tests**

Create `src/main/services/MemoryTimelineService.test.cjs` with fake `ScreenpipeClient` and fake store. Cover:

```js
test('queryTimeline filters sensitive content and groups records into 15 minute buckets', async () => {
  const { MemoryTimelineService } = loadModule()
  const service = new MemoryTimelineService({
    screenpipeClient: {
      search: async () => ({
        success: true,
        data: [
          { id: '1', timestamp: '2026-05-26T01:00:00.000Z', contentType: 'ocr', appName: 'Code', windowName: 'memoryDiary.ts', url: '', text: 'timeline implementation' },
          { id: '2', timestamp: '2026-05-26T01:08:00.000Z', contentType: 'accessibility', appName: 'Chrome', windowName: 'ScreenPipe docs', url: 'https://docs.screenpi.pe', text: 'search api docs' },
          { id: '3', timestamp: '2026-05-26T01:10:00.000Z', contentType: 'ocr', appName: '1Password', windowName: 'Vault', url: '', text: 'secret' }
        ]
      })
    },
    storeService: {
      get: () => ({
        config: {
          apiUrl: 'http://localhost:3030',
          apiKey: 'token',
          enabledContentTypes: ['accessibility', 'ocr'],
          includeAudio: false,
          includeInput: false,
          sensitiveAppPatterns: ['1Password'],
          sensitiveWindowPatterns: [],
          timelineBucketMinutes: 15,
          diaryStyle: 'worklog'
        },
        diaryHistory: [],
        deploymentLogs: []
      })
    }
  })

  const result = await service.queryTimeline({ date: '2026-05-26', timezone: 'Asia/Shanghai' })

  assert.equal(result.success, true)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].items.length, 2)
  assert.deepEqual(result.data[0].appNames, ['Code', 'Chrome'])
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `node --test src/main/services/MemoryTimelineService.test.cjs`

Expected: FAIL because `MemoryTimelineService.ts` does not exist.

- [ ] **Step 3: Implement timeline service**

Create `src/main/services/MemoryTimelineService.ts` with:

```ts
import type { IpcResponse } from '../../shared/types'
import type { MemoryDiaryItem, MemoryDiaryTimelineBucket } from '../../shared/memoryDiary'
import { createMemoryDiaryBucketStart, filterMemoryDiaryItems } from '../../shared/memoryDiary'
import { storeService } from './StoreService'
import { screenpipeClient, type ScreenpipeClient } from './ScreenpipeClient'

type StoreLike = Pick<typeof storeService, 'get'>

export interface MemoryTimelineQuery {
  date: string
  timezone: string
}

export class MemoryTimelineService {
  private readonly client: Pick<ScreenpipeClient, 'search'>
  private readonly store: StoreLike

  constructor(dependencies: { screenpipeClient?: Pick<ScreenpipeClient, 'search'>; storeService?: StoreLike } = {}) {
    this.client = dependencies.screenpipeClient ?? screenpipeClient
    this.store = dependencies.storeService ?? storeService
  }

  async queryTimeline(request: MemoryTimelineQuery): Promise<IpcResponse<MemoryDiaryTimelineBucket[]>> {
    const state = this.store.get('memoryDiary')
    const config = state.config
    const range = this.getLocalDateRange(request.date)
    const result = await this.client.search({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      startTime: range.start,
      endTime: range.end,
      contentTypes: config.enabledContentTypes,
      limit: 3000
    })
    if (!result.success || !result.data) return { success: false, error: result.error || '读取 ScreenPipe 时间线失败' }
    const filtered = filterMemoryDiaryItems(result.data, config)
    return { success: true, data: this.createBuckets(filtered, config.timelineBucketMinutes) }
  }

  private getLocalDateRange(date: string): { start: string; end: string } {
    const start = new Date(`${date}T00:00:00.000`)
    const end = new Date(`${date}T23:59:59.999`)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  private createBuckets(items: MemoryDiaryItem[], bucketMinutes: number): MemoryDiaryTimelineBucket[] {
    const groups = new Map<string, MemoryDiaryItem[]>()
    for (const item of items) {
      const key = createMemoryDiaryBucketStart(item.timestamp, bucketMinutes)
      groups.set(key, [...(groups.get(key) || []), item])
    }

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([start, bucketItems]) => {
        const startDate = new Date(start)
        const end = new Date(startDate.getTime() + bucketMinutes * 60 * 1000).toISOString()
        const appNames = this.unique(bucketItems.map((item) => item.appName).filter(Boolean))
        const windowNames = this.unique(bucketItems.map((item) => item.windowName).filter(Boolean))
        const urls = this.unique(bucketItems.map((item) => item.url).filter(Boolean))
        const contentTypes = this.unique(bucketItems.map((item) => item.contentType))
        const keyTexts = this.unique(bucketItems.map((item) => item.text).filter(Boolean)).slice(0, 5)
        return {
          id: start,
          start,
          end,
          title: appNames.length ? appNames.join(' / ') : '未命名活动',
          summary: keyTexts[0] || '此时间段有活动记录',
          appNames,
          windowNames,
          urls,
          contentTypes,
          keyTexts,
          items: bucketItems
        }
      })
  }

  private unique<T>(items: T[]): T[] {
    return Array.from(new Set(items))
  }
}

export const memoryTimelineService = new MemoryTimelineService()
```

- [ ] **Step 4: Run timeline tests**

Run: `node --test src/main/services/MemoryTimelineService.test.cjs`

Expected: PASS.

- [ ] **Step 5: Commit timeline service**

```bash
git add src/main/services/MemoryTimelineService.ts src/main/services/MemoryTimelineService.test.cjs
git commit -m "feat: add memory timeline aggregation"
```

## Task 5: Diary Generation And History

**Files:**
- Create: `src/main/services/llmAdapters/MemoryDiaryAdapter.ts`
- Create: `src/main/services/llmAdapters/MemoryDiaryAdapter.test.cjs`
- Modify: `src/main/services/LlmService.ts`
- Create: `src/main/services/MemoryDiaryService.ts`
- Create: `src/main/services/MemoryDiaryService.test.cjs`

- [ ] **Step 1: Write adapter tests**

Create `src/main/services/llmAdapters/MemoryDiaryAdapter.test.cjs`. Test that `buildCompletion` includes data range, privacy flags, and bucket summaries, and `mapDiaryResult` creates valid Markdown defaults when payload is partial.

- [ ] **Step 2: Implement adapter**

Create `src/main/services/llmAdapters/MemoryDiaryAdapter.ts`:

```ts
import type { MemoryDiaryGenerateRequest, MemoryDiaryGenerateResult } from '../../../shared/memoryDiary'

export class MemoryDiaryAdapter {
  buildCompletion(input: MemoryDiaryGenerateRequest) {
    const bucketLines = input.buckets.map((bucket) => [
      `- ${bucket.start} - ${bucket.end}`,
      `  应用：${bucket.appNames.join(', ') || '未知'}`,
      `  摘要：${bucket.summary}`,
      `  关键文本：${bucket.keyTexts.slice(0, 4).join(' / ')}`
    ].join('\n')).join('\n')

    return {
      systemPrompt: [
        '你是中文工作日报助手。',
        '你会基于本地 ScreenPipe 时间线生成克制、准确、可编辑的 Markdown 日报。',
        '不要编造时间线中不存在的事实。',
        '只返回 JSON：{"title":"","summary":"","markdown":""}'
      ].join('\n'),
      userPrompt: [
        `日期：${input.date}`,
        `时区：${input.timezone}`,
        `日报风格：${input.config.diaryStyle}`,
        `包含音频：${input.config.includeAudio ? '是' : '否'}`,
        `包含 input：${input.config.includeInput ? '是' : '否'}`,
        `用户补充：${input.userNotes || '无'}`,
        `[时间线]`,
        bucketLines || '当天没有可用时间线记录'
      ].join('\n')
    }
  }

  mapDiaryResult(input: MemoryDiaryGenerateRequest, payload: Partial<Pick<MemoryDiaryGenerateResult, 'title' | 'summary' | 'markdown'>>): MemoryDiaryGenerateResult {
    const createdAt = new Date().toISOString()
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : `${input.date} 工作日报`
    const summary = typeof payload.summary === 'string' && payload.summary.trim() ? payload.summary.trim() : '已生成当天工作日报'
    const markdown = typeof payload.markdown === 'string' && payload.markdown.trim()
      ? payload.markdown.trim()
      : `# ${title}\n\n${summary}\n`
    return {
      id: `${input.date}-${Date.now()}`,
      date: input.date,
      title,
      summary,
      markdown,
      createdAt
    }
  }
}
```

- [ ] **Step 3: Extend LlmService**

Modify `src/main/services/LlmService.ts`:

```ts
import type { MemoryDiaryGenerateRequest, MemoryDiaryGenerateResult } from '../../shared/memoryDiary'
import { MemoryDiaryAdapter } from './llmAdapters/MemoryDiaryAdapter'
```

Add property:

```ts
private readonly memoryDiaryAdapter: MemoryDiaryAdapter
```

Initialize:

```ts
this.memoryDiaryAdapter = new MemoryDiaryAdapter()
```

Add method:

```ts
async generateMemoryDiary(input: MemoryDiaryGenerateRequest): Promise<IpcResponse<MemoryDiaryGenerateResult>> {
  try {
    const payload = await this.createStructuredCompletion<Partial<MemoryDiaryGenerateResult>>(
      this.memoryDiaryAdapter.buildCompletion(input)
    )
    return { success: true, data: this.memoryDiaryAdapter.mapDiaryResult(input, payload) }
  } catch (error) {
    return { success: false, error: this.toErrorMessage(error) }
  }
}
```

- [ ] **Step 4: Write diary service tests**

Create `src/main/services/MemoryDiaryService.test.cjs`. Use fake `llmService`, fake `storeService`, fake `app.getPath('userData')`, and fake `fs.promises`. Test:

- `generate` forwards to LLM and returns Markdown.
- `save` writes `memory-diary/daily/<id>.md` and stores a history entry.
- `list` returns history newest first.
- `delete` removes the entry and attempts to unlink the Markdown file.

- [ ] **Step 5: Implement diary service**

Create `src/main/services/MemoryDiaryService.ts` with:

```ts
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import type { IpcResponse } from '../../shared/types'
import type { MemoryDiaryGenerateRequest, MemoryDiaryGenerateResult, MemoryDiaryHistoryEntry } from '../../shared/memoryDiary'
import { storeService } from './StoreService'
import { llmService } from './LlmService'

export class MemoryDiaryService {
  async generate(request: MemoryDiaryGenerateRequest): Promise<IpcResponse<MemoryDiaryGenerateResult>> {
    return llmService.generateMemoryDiary(request)
  }

  list(): IpcResponse<MemoryDiaryHistoryEntry[]> {
    const state = storeService.get('memoryDiary')
    return { success: true, data: [...state.diaryHistory].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }

  async save(result: MemoryDiaryGenerateResult): Promise<IpcResponse<MemoryDiaryHistoryEntry>> {
    const directory = path.join(app.getPath('userData'), 'memory-diary', 'daily')
    await fs.promises.mkdir(directory, { recursive: true })
    const markdownPath = path.join(directory, `${result.id}.md`)
    await fs.promises.writeFile(markdownPath, result.markdown, 'utf8')
    const now = new Date().toISOString()
    const entry: MemoryDiaryHistoryEntry = {
      id: result.id,
      date: result.date,
      title: result.title,
      summary: result.summary,
      markdownPath,
      createdAt: result.createdAt,
      updatedAt: now
    }
    const state = storeService.get('memoryDiary')
    storeService.set('memoryDiary', {
      ...state,
      diaryHistory: [entry, ...state.diaryHistory.filter((item) => item.id !== entry.id)]
    })
    return { success: true, data: entry }
  }

  async delete(id: string): Promise<IpcResponse> {
    const state = storeService.get('memoryDiary')
    const entry = state.diaryHistory.find((item) => item.id === id)
    if (entry) {
      await fs.promises.unlink(entry.markdownPath).catch(() => undefined)
    }
    storeService.set('memoryDiary', {
      ...state,
      diaryHistory: state.diaryHistory.filter((item) => item.id !== id)
    })
    return { success: true }
  }
}

export const memoryDiaryService = new MemoryDiaryService()
```

- [ ] **Step 6: Run diary tests**

Run: `node --test src/main/services/llmAdapters/MemoryDiaryAdapter.test.cjs src/main/services/MemoryDiaryService.test.cjs src/main/services/LlmService.test.cjs`

Expected: PASS.

- [ ] **Step 7: Commit diary generation**

```bash
git add src/main/services/llmAdapters/MemoryDiaryAdapter.ts src/main/services/llmAdapters/MemoryDiaryAdapter.test.cjs src/main/services/LlmService.ts src/main/services/MemoryDiaryService.ts src/main/services/MemoryDiaryService.test.cjs
git commit -m "feat: add memory diary generation"
```

## Task 6: Renderer Tool Entry And UI

**Files:**
- Create: `src/renderer/src/tools/MemoryDiaryTool.tsx`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/renderer/src/data/tools.ts`
- Modify: `src/renderer/src/appRouting.test.cjs`

- [ ] **Step 1: Update tool registry test**

Add a test to `src/renderer/src/appRouting.test.cjs`:

```js
test('tools registry exposes the memory diary tool through the main shell route map', () => {
  const memoryTool = actualTools.find((tool) => tool.id === 'memory-diary')

  assert.ok(memoryTool)
  assert.deepEqual(
    toPlainObject(memoryTool),
    {
      id: 'memory-diary',
      name: '记忆日报',
      description: '管理 ScreenPipe 本地采集，生成今日时间线与 AI 日报',
      category: '日常办公',
      icon: 'Brain',
      componentPath: 'MemoryDiaryTool'
    }
  )

  const { result: map, warnings } = captureWarnings(() => createToolRouteModuleMap([memoryTool], {
    './components/SettingsPage.tsx': () => 'settings'
  }, {
    './tools/MemoryDiaryTool.tsx': () => 'memory-diary'
  }))

  assert.equal(typeof map['memory-diary'], 'function')
  assert.equal(typeof map.settings, 'function')
  assert.equal(warnings.length, 0)
})
```

- [ ] **Step 2: Run route test and verify failure**

Run: `node --test src/renderer/src/appRouting.test.cjs`

Expected: FAIL because the registry does not include `memory-diary`.

- [ ] **Step 3: Add tool registry entry**

Modify `src/renderer/src/data/tools.ts`:

```ts
{
  id: 'memory-diary',
  name: '记忆日报',
  description: '管理 ScreenPipe 本地采集，生成今日时间线与 AI 日报',
  category: '日常办公',
  icon: 'Brain',
  componentPath: 'MemoryDiaryTool'
},
```

- [ ] **Step 4: Add bridge type**

Modify `src/renderer/src/types/electron.d.ts` so `window.electron.memoryDiary` includes:

```ts
getCliStatus(): Promise<any>
updateConfig(updates: any): Promise<any>
startScreenpipe(): Promise<any>
stopScreenpipe(): Promise<any>
getToken(): Promise<any>
getLogs(): Promise<any>
queryTimeline(request: any): Promise<any>
generateDiary(request: any): Promise<any>
listDiaries(): Promise<any>
saveDiary(request: any): Promise<any>
deleteDiary(id: string): Promise<any>
```

- [ ] **Step 5: Create the renderer tool**

Create `src/renderer/src/tools/MemoryDiaryTool.tsx`. Keep the first implementation functional and plain:

```tsx
import React, { useEffect, useMemo, useState } from 'react'
import { Brain, KeyRound, Play, RefreshCw, Save, Square, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { MemoryDiaryConfig, MemoryDiaryGenerateResult, MemoryDiaryTimelineBucket } from '../../../shared/memoryDiary'
import { createDefaultMemoryDiaryConfig } from '../../../shared/memoryDiary'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export default function MemoryDiaryTool() {
  const api = (window.electron as any)?.memoryDiary
  const [config, setConfig] = useState<MemoryDiaryConfig>(createDefaultMemoryDiaryConfig())
  const [cliStatus, setCliStatus] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [timeline, setTimeline] = useState<MemoryDiaryTimelineBucket[]>([])
  const [draft, setDraft] = useState<MemoryDiaryGenerateResult | null>(null)
  const [userNotes, setUserNotes] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const hasTimeline = timeline.length > 0
  const includedTypes = useMemo(() => {
    const set = new Set(config.enabledContentTypes)
    if (config.includeAudio) set.add('audio')
    if (config.includeInput) set.add('input')
    return Array.from(set).join(', ')
  }, [config])

  const refreshStatus = async () => {
    const [statusResult, logsResult] = await Promise.all([
      api?.getCliStatus?.(),
      api?.getLogs?.()
    ])
    if (statusResult?.success) setCliStatus(statusResult.data)
    if (logsResult?.success) setLogs(logsResult.data)
  }

  useEffect(() => {
    void refreshStatus()
  }, [])

  const saveConfig = async () => {
    const result = await api?.updateConfig?.(config)
    if (result?.success && result.data?.config) setConfig(result.data.config)
  }

  const queryTimeline = async () => {
    setIsBusy(true)
    const result = await api?.queryTimeline?.({ date: todayString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    if (result?.success && result.data) setTimeline(result.data)
    setIsBusy(false)
  }

  const generateDiary = async () => {
    setIsBusy(true)
    const result = await api?.generateDiary?.({
      date: todayString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      buckets: timeline,
      config,
      userNotes
    })
    if (result?.success && result.data) setDraft(result.data)
    setIsBusy(false)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight">记忆日报</h1>
          <p className="text-sm text-muted-foreground">管理 ScreenPipe 本地采集，生成今日时间线与 AI 日报。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">CLI {cliStatus?.installed ? '已安装' : '未安装'}</Badge>
          <Badge variant="outline">API {config.apiUrl}</Badge>
          <Badge variant="outline">数据范围 {includedTypes}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" />部署管理</CardTitle>
              <CardDescription>半自动管理 ScreenPipe CLI、Token 和本地进程。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" onClick={refreshStatus}><RefreshCw className="w-4 h-4 mr-2" />刷新状态</Button>
              <Button variant="outline" onClick={() => api?.getToken?.().then(refreshStatus)}><KeyRound className="w-4 h-4 mr-2" />获取 Token</Button>
              <Button variant="outline" onClick={() => api?.startScreenpipe?.().then(refreshStatus)}><Play className="w-4 h-4 mr-2" />启动 ScreenPipe</Button>
              <Button variant="outline" onClick={() => api?.stopScreenpipe?.().then(refreshStatus)}><Square className="w-4 h-4 mr-2" />停止托管进程</Button>
              <div className="text-xs text-muted-foreground">{cliStatus?.error || cliStatus?.version || '等待检测'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>隐私设置</CardTitle>
              <CardDescription>默认不包含音频和 input。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={config.apiUrl} onChange={(e) => setConfig((prev) => ({ ...prev, apiUrl: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.includeAudio} onChange={(e) => setConfig((prev) => ({ ...prev, includeAudio: e.target.checked }))} />包含音频转录</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.includeInput} onChange={(e) => setConfig((prev) => ({ ...prev, includeInput: e.target.checked }))} />包含 input</label>
              <Button onClick={saveConfig}><Save className="w-4 h-4 mr-2" />保存设置</Button>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between"><span>今日时间线</span><Button onClick={queryTimeline} disabled={isBusy}>读取时间线</Button></CardTitle>
              <CardDescription>按 {config.timelineBucketMinutes} 分钟聚合 ScreenPipe 记录。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!hasTimeline ? <div className="text-sm text-muted-foreground">还没有时间线数据。</div> : timeline.map((bucket) => (
                <div key={bucket.id} className="rounded-lg border p-3">
                  <div className="font-semibold">{new Date(bucket.start).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} {bucket.title}</div>
                  <div className="text-sm text-muted-foreground">{bucket.summary}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{bucket.keyTexts.slice(0, 3).join(' / ')}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Brain className="w-5 h-5" />日报生成</CardTitle>
              <CardDescription>生成前会使用当前时间线和隐私设置。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea className="w-full min-h-24 rounded-md border bg-background p-3 text-sm" value={userNotes} onChange={(e) => setUserNotes(e.target.value)} placeholder="补充今天你想强调的事情" />
              <Button onClick={generateDiary} disabled={isBusy || !hasTimeline}>生成日报</Button>
              {draft && <pre className="max-h-96 overflow-auto rounded-lg border p-4 text-sm whitespace-pre-wrap">{draft.markdown}</pre>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>部署日志</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {logs.length === 0 ? '暂无日志' : logs.slice(0, 8).map((log) => <div key={log.id}>{log.timestamp} {log.message}</div>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run route test**

Run: `node --test src/renderer/src/appRouting.test.cjs`

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit renderer tool**

```bash
git add src/renderer/src/tools/MemoryDiaryTool.tsx src/renderer/src/types/electron.d.ts src/renderer/src/data/tools.ts src/renderer/src/appRouting.test.cjs
git commit -m "feat: add memory diary tool ui"
```

## Task 7: Final Integration Verification

**Files:**
- No new files unless verification exposes missing type or IPC wiring.

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
node --test src/shared/memoryDiary.test.cjs src/main/services/ScreenpipeClient.test.cjs src/main/services/ScreenpipeManagementService.test.cjs src/main/services/MemoryTimelineService.test.cjs src/main/services/llmAdapters/MemoryDiaryAdapter.test.cjs src/main/services/MemoryDiaryService.test.cjs src/main/ipc/memoryDiaryIpc.test.cjs src/main/bootstrap/registerIpc.test.cjs src/renderer/src/appRouting.test.cjs
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run app smoke check**

Run: `npm run dev`

Expected: The app starts. Open `记忆日报` from the sidebar. The page renders without crashing and shows CLI/API status cards. Stop the dev server after the smoke check.

- [ ] **Step 5: Final commit if fixes were needed**

If Step 1-4 required fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize memory diary integration"
```

## Self-Review

Spec coverage:

- ScreenPipe B档本地运维面板: Task 3 and Task 6.
- 半自动部署: Task 3 service and IPC.
- 隐私保守默认: Task 1 defaults and Task 4 filtering.
- 今日时间线: Task 4 service and Task 6 UI.
- AI 日报生成: Task 5 service and Task 6 UI.
- 日报历史: Task 5 storage.
- 博客发布非目标: No implementation task, as required by spec.

Placeholder scan:

- The plan avoids unresolved placeholder markers.
- Optional renderer helper files are explicitly optional and not needed for acceptance.

Type consistency:

- Shared names from Task 1 are used consistently by later tasks.
- IPC names match the preload methods and renderer calls.
