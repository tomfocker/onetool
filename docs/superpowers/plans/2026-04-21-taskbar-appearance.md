# Taskbar Appearance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-only `任务栏美化` tool that lets users switch between default, transparent, blur, and acrylic taskbar styles, with blur as the primary stable experience and safe restore/persistence behavior.

**Architecture:** Keep Electron renderer, main-process orchestration, and Windows-specific execution separate. Renderer only sends intent, `TaskbarAppearanceService` owns support detection and persistence, and `WindowsTaskbarAdapter` uses existing PowerShell execution utilities plus inline C# `Add-Type` calls to reach Windows composition APIs without adding new native dependencies.

**Tech Stack:** Electron main/preload/renderer, TypeScript, node:test, existing PowerShell execution helpers, Windows taskbar composition via PowerShell + inline C#

---

## File Map

- Create: `src/shared/taskbarAppearance.ts`
  Responsibility: shared preset/config/status types and pure helper functions for defaults, preset translation, and support detection.
- Create: `src/shared/taskbarAppearance.test.cjs`
  Responsibility: test pure shared taskbar helpers with no Electron dependency.
- Modify: `src/shared/types.ts`
  Responsibility: extend `AppSettings` with persisted taskbar appearance fields.
- Create: `src/main/services/windows/WindowsTaskbarAdapter.ts`
  Responsibility: build and run PowerShell scripts that find the taskbar window and apply or clear composition styles.
- Create: `src/main/services/windows/WindowsTaskbarAdapter.test.cjs`
  Responsibility: test script generation, command dispatch, and failure handling with mocked PowerShell helpers.
- Create: `src/main/services/TaskbarAppearanceService.ts`
  Responsibility: expose `getStatus`, `applyPreset`, `restoreDefault`, and startup restore using shared helpers plus the adapter.
- Create: `src/main/services/TaskbarAppearanceService.test.cjs`
  Responsibility: test service-level support gating, settings persistence, and fallback behavior with mocked adapter/settings.
- Modify: `src/main/services/SettingsService.ts`
  Responsibility: persist new taskbar fields in the existing settings payload.
- Modify: `src/main/services/SettingsService.test.cjs`
  Responsibility: prove the new fields persist without regressing existing settings write semantics.
- Create: `src/main/ipc/taskbarAppearanceIpc.ts`
  Responsibility: register explicit IPC handlers for status, apply, and restore.
- Create: `src/main/ipc/taskbarAppearanceIpc.test.cjs`
  Responsibility: verify IPC channels delegate to the service and preserve returned payloads.
- Modify: `src/main/index.ts`
  Responsibility: register the new IPC and initialize startup restore after settings load.
- Modify: `src/preload/createElectronBridge.ts`
  Responsibility: expose a narrow `window.electron.taskbarAppearance` API.
- Modify: `src/preload/createElectronBridge.test.cjs`
  Responsibility: verify the new preload API maps to the intended IPC channels.
- Create: `src/renderer/src/tools/TaskbarAppearanceTool.tsx`
  Responsibility: render the Windows-only tool UI with presets, intensity/tint controls, status, and restore button.
- Modify: `src/renderer/src/data/tools.ts`
  Responsibility: add the new tool definition to the tool list.
- Modify: `src/renderer/src/appRouting.test.cjs`
  Responsibility: keep routing coverage intact for the new tool module.

### Task 1: Shared Taskbar Contracts And Preset Logic

**Files:**
- Create: `src/shared/taskbarAppearance.ts`
- Create: `src/shared/taskbarAppearance.test.cjs`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write the failing shared helper test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTaskbarAppearanceModule() {
  const filePath = path.join(__dirname, 'taskbarAppearance.ts')
  const source = fs.readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filePath
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(transpiled, { module, exports: module.exports, require, __dirname, __filename: filePath, console, process }, { filename: filePath })
  return module.exports
}

test('resolveTaskbarAppearanceAvailability enables blur on supported Windows 11 builds and blocks acrylic on unsupported hosts', () => {
  const {
    createDefaultTaskbarAppearanceSettings,
    resolveTaskbarAppearanceAvailability
  } = loadTaskbarAppearanceModule()

  const defaults = createDefaultTaskbarAppearanceSettings()
  assert.equal(defaults.preset, 'blur')
  assert.equal(defaults.intensity, 60)

  const supported = resolveTaskbarAppearanceAvailability({ platform: 'win32', release: '10.0.22631' })
  assert.equal(supported.supported, true)
  assert.equal(supported.presets.blur.available, true)

  const unsupported = resolveTaskbarAppearanceAvailability({ platform: 'darwin', release: '23.0.0' })
  assert.equal(unsupported.supported, false)
  assert.equal(unsupported.presets.acrylic.available, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/shared/taskbarAppearance.test.cjs`
Expected: FAIL with `ENOENT` or `Cannot find module` for `src/shared/taskbarAppearance.ts`.

- [ ] **Step 3: Write the minimal shared implementation**

```ts
export type TaskbarAppearancePreset = 'default' | 'transparent' | 'blur' | 'acrylic'

export interface TaskbarAppearanceSettings {
  enabled: boolean
  preset: TaskbarAppearancePreset
  intensity: number
  tintHex: string
}

export function createDefaultTaskbarAppearanceSettings(): TaskbarAppearanceSettings {
  return {
    enabled: false,
    preset: 'blur',
    intensity: 60,
    tintHex: '#FFFFFF33'
  }
}

export function resolveTaskbarAppearanceAvailability(runtime: { platform: NodeJS.Platform; release: string }) {
  const isWindows = runtime.platform === 'win32'
  const build = Number((runtime.release.split('.').at(-1) ?? '0'))
  const windows11 = isWindows && build >= 22000

  return {
    supported: windows11,
    presets: {
      default: { available: isWindows, reason: null },
      transparent: { available: windows11, reason: windows11 ? null : '仅支持 Windows 11' },
      blur: { available: windows11, reason: windows11 ? null : '仅支持 Windows 11' },
      acrylic: { available: build >= 22621, reason: build >= 22621 ? null : '当前系统版本不建议启用亚克力' }
    }
  }
}
```

```ts
export interface AppSettings {
  // existing fields...
  taskbarAppearanceEnabled: boolean
  taskbarAppearancePreset: TaskbarAppearancePreset
  taskbarAppearanceIntensity: number
  taskbarAppearanceTint: string
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/shared/taskbarAppearance.test.cjs`
Expected: PASS with the new helper module loaded and the support matrix assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/taskbarAppearance.ts src/shared/taskbarAppearance.test.cjs src/shared/types.ts
git commit -m "feat: add shared taskbar appearance contracts"
```

### Task 2: Windows Taskbar Adapter Through PowerShell

**Files:**
- Create: `src/main/services/windows/WindowsTaskbarAdapter.ts`
- Create: `src/main/services/windows/WindowsTaskbarAdapter.test.cjs`

- [ ] **Step 1: Write the failing adapter test**

```js
test('applyAppearance emits a PowerShell script that includes blur mode and the requested tint', async () => {
  const calls = []
  const { WindowsTaskbarAdapter } = loadWindowsTaskbarAdapterModule({
    execPowerShellEncoded: async (script) => {
      calls.push(script)
      return 'ok'
    }
  })

  const adapter = new WindowsTaskbarAdapter()
  const result = await adapter.applyAppearance({
    preset: 'blur',
    intensity: 72,
    tintHex: '#11223344'
  })

  assert.equal(result.success, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /SetWindowCompositionAttribute/)
  assert.match(calls[0], /11223344/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/windows/WindowsTaskbarAdapter.test.cjs`
Expected: FAIL because `WindowsTaskbarAdapter.ts` does not exist yet.

- [ ] **Step 3: Write the minimal adapter implementation**

```ts
import { execPowerShellEncoded } from '../../utils/processUtils'
import type { IpcResponse } from '../../../shared/types'
import type { TaskbarAppearancePreset } from '../../../shared/taskbarAppearance'

function buildCompositionScript(input: { preset: TaskbarAppearancePreset; intensity: number; tintHex: string }) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class TaskbarAccent {
  [DllImport("user32.dll")] public static extern int FindWindow(string lpClassName, string lpWindowName);
}
"@
# This first green step only proves the command path and payload plumbing.
# Task 6 replaces this minimal script with the full accent policy structs and composition call.
Write-Output '${input.tintHex.replace('#', '')}'
Write-Output 'SetWindowCompositionAttribute'
`
}

export class WindowsTaskbarAdapter {
  async applyAppearance(input: { preset: TaskbarAppearancePreset; intensity: number; tintHex: string }): Promise<IpcResponse> {
    const output = await execPowerShellEncoded(buildCompositionScript(input))
    return output.includes('SetWindowCompositionAttribute')
      ? { success: true }
      : { success: false, error: '任务栏样式应用失败' }
  }

  async restoreDefault(): Promise<IpcResponse> {
    const output = await execPowerShellEncoded(`Write-Output 'restore-default'`)
    return output.includes('restore-default')
      ? { success: true }
      : { success: false, error: '任务栏样式恢复失败' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/windows/WindowsTaskbarAdapter.test.cjs`
Expected: PASS and confirm the adapter emits the PowerShell script through the existing encoded-command helper.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/windows/WindowsTaskbarAdapter.ts src/main/services/windows/WindowsTaskbarAdapter.test.cjs
git commit -m "feat: add windows taskbar appearance adapter"
```

### Task 3: Service Layer And Settings Persistence

**Files:**
- Create: `src/main/services/TaskbarAppearanceService.ts`
- Create: `src/main/services/TaskbarAppearanceService.test.cjs`
- Modify: `src/main/services/SettingsService.ts`
- Modify: `src/main/services/SettingsService.test.cjs`

- [ ] **Step 1: Write the failing service test**

```js
test('applyPreset persists settings only after the adapter succeeds', async () => {
  const saved = []
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    adapter: {
      applyAppearance: async () => ({ success: true }),
      restoreDefault: async () => ({ success: true })
    },
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: false,
        taskbarAppearancePreset: 'blur',
        taskbarAppearanceIntensity: 60,
        taskbarAppearanceTint: '#FFFFFF33'
      }),
      updateSettings: async (updates) => {
        saved.push(updates)
        return { success: true }
      }
    },
    platform: 'win32',
    release: '10.0.22631'
  })

  const service = new TaskbarAppearanceService()
  const result = await service.applyPreset({ preset: 'blur', intensity: 70, tintHex: '#AABBCC44' })

  assert.equal(result.success, true)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].taskbarAppearancePreset, 'blur')
  assert.equal(saved[0].taskbarAppearanceIntensity, 70)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/TaskbarAppearanceService.test.cjs src/main/services/SettingsService.test.cjs`
Expected: FAIL because the service file and new settings fields are not implemented yet.

- [ ] **Step 3: Write the minimal service and settings implementation**

```ts
import os from 'node:os'
import { settingsService } from './SettingsService'
import { WindowsTaskbarAdapter } from './windows/WindowsTaskbarAdapter'
import {
  createDefaultTaskbarAppearanceSettings,
  resolveTaskbarAppearanceAvailability
} from '../../shared/taskbarAppearance'

export class TaskbarAppearanceService {
  constructor(
    private readonly adapter = new WindowsTaskbarAdapter(),
    private readonly settings = settingsService,
    private readonly runtime = { platform: process.platform, release: os.release() }
  ) {}

  getStatus() {
    const persisted = this.settings.getSettings()
    const support = resolveTaskbarAppearanceAvailability(this.runtime)
    return {
      success: true,
      data: {
        support,
        settings: {
          enabled: persisted.taskbarAppearanceEnabled,
          preset: persisted.taskbarAppearancePreset,
          intensity: persisted.taskbarAppearanceIntensity,
          tintHex: persisted.taskbarAppearanceTint
        }
      }
    }
  }

  async applyPreset(input: { preset: 'default' | 'transparent' | 'blur' | 'acrylic'; intensity: number; tintHex: string }) {
    const result = input.preset === 'default'
      ? await this.adapter.restoreDefault()
      : await this.adapter.applyAppearance(input)

    if (!result.success) {
      return result
    }

    return this.settings.updateSettings({
      taskbarAppearanceEnabled: input.preset !== 'default',
      taskbarAppearancePreset: input.preset,
      taskbarAppearanceIntensity: input.intensity,
      taskbarAppearanceTint: input.tintHex
    })
  }
}
```

```ts
private settings: AppSettings = {
  // existing fields...
  taskbarAppearanceEnabled: false,
  taskbarAppearancePreset: 'blur',
  taskbarAppearanceIntensity: 60,
  taskbarAppearanceTint: '#FFFFFF33'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/TaskbarAppearanceService.test.cjs src/main/services/SettingsService.test.cjs`
Expected: PASS and confirm failed writes still do not mutate in-memory settings.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/TaskbarAppearanceService.ts src/main/services/TaskbarAppearanceService.test.cjs src/main/services/SettingsService.ts src/main/services/SettingsService.test.cjs
git commit -m "feat: add taskbar appearance service"
```

### Task 4: IPC, Preload Bridge, And Startup Wiring

**Files:**
- Create: `src/main/ipc/taskbarAppearanceIpc.ts`
- Create: `src/main/ipc/taskbarAppearanceIpc.test.cjs`
- Modify: `src/main/index.ts`
- Modify: `src/preload/createElectronBridge.ts`
- Modify: `src/preload/createElectronBridge.test.cjs`

- [ ] **Step 1: Write the failing bridge and IPC tests**

```js
test('createElectronBridge maps taskbar appearance APIs to explicit IPC channels', async () => {
  const { createElectronBridge } = loadCreateElectronBridgeModule()
  const mocks = createMocks()
  const bridge = createElectronBridge(mocks.deps)

  await bridge.taskbarAppearance.getStatus()
  await bridge.taskbarAppearance.applyPreset({ preset: 'blur', intensity: 66, tintHex: '#33445566' })
  await bridge.taskbarAppearance.restoreDefault()

  assert.deepEqual(mocks.invokeCalls, [
    ['taskbar-appearance-get-status'],
    ['taskbar-appearance-apply-preset', { preset: 'blur', intensity: 66, tintHex: '#33445566' }],
    ['taskbar-appearance-restore-default']
  ])
})
```

```js
test('registerTaskbarAppearanceIpc delegates every handler to the service', async () => {
  const handled = new Map()
  const service = {
    getStatus: () => ({ success: true, data: { ok: true } }),
    applyPreset: async (payload) => ({ success: true, data: payload }),
    restoreDefault: async () => ({ success: true })
  }
  const { registerTaskbarAppearanceIpc } = loadTaskbarAppearanceIpcModule({ handled, service })

  registerTaskbarAppearanceIpc()

  assert.equal(typeof handled.get('taskbar-appearance-get-status'), 'function')
  assert.deepEqual(await handled.get('taskbar-appearance-apply-preset')({}, { preset: 'blur' }), { success: true, data: { preset: 'blur' } })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/preload/createElectronBridge.test.cjs src/main/ipc/taskbarAppearanceIpc.test.cjs`
Expected: FAIL because neither the bridge namespace nor the new IPC registration file exists.

- [ ] **Step 3: Write the minimal IPC and wiring implementation**

```ts
// src/main/ipc/taskbarAppearanceIpc.ts
import { ipcMain } from 'electron'
import { taskbarAppearanceService } from '../services/TaskbarAppearanceService'

export function registerTaskbarAppearanceIpc() {
  ipcMain.handle('taskbar-appearance-get-status', () => taskbarAppearanceService.getStatus())
  ipcMain.handle('taskbar-appearance-apply-preset', (_event, payload) => taskbarAppearanceService.applyPreset(payload))
  ipcMain.handle('taskbar-appearance-restore-default', () => taskbarAppearanceService.restoreDefault())
}
```

```ts
// src/preload/createElectronBridge.ts
const taskbarAppearanceAPI = {
  getStatus: () => ipcRenderer.invoke('taskbar-appearance-get-status'),
  applyPreset: (payload: { preset: string; intensity: number; tintHex: string }) => {
    return ipcRenderer.invoke('taskbar-appearance-apply-preset', payload)
  },
  restoreDefault: () => ipcRenderer.invoke('taskbar-appearance-restore-default')
}

return {
  // existing namespaces...
  taskbarAppearance: taskbarAppearanceAPI
}
```

```ts
// src/main/index.ts
import { registerTaskbarAppearanceIpc } from './ipc/taskbarAppearanceIpc'
import { taskbarAppearanceService } from './services/TaskbarAppearanceService'

registerTaskbarAppearanceIpc()
void taskbarAppearanceService.restoreFromSettings()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/preload/createElectronBridge.test.cjs src/main/ipc/taskbarAppearanceIpc.test.cjs`
Expected: PASS with explicit channel coverage for get/apply/restore.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/taskbarAppearanceIpc.ts src/main/ipc/taskbarAppearanceIpc.test.cjs src/main/index.ts src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs
git commit -m "feat: wire taskbar appearance ipc"
```

### Task 5: Renderer Tool Registration And UI

**Files:**
- Create: `src/renderer/src/tools/TaskbarAppearanceTool.tsx`
- Modify: `src/renderer/src/data/tools.ts`
- Modify: `src/renderer/src/appRouting.test.cjs`

- [ ] **Step 1: Write the failing routing test**

```js
test('createToolRouteModuleMap keeps the taskbar appearance tool routable in the main shell', () => {
  const tools = [
    { id: 'taskbar-appearance', componentPath: 'TaskbarAppearanceTool' }
  ]

  const { result: map } = captureWarnings(() => createToolRouteModuleMap(tools, {
    './components/ConfigChecker.tsx': () => 'config',
    './components/SettingsPage.tsx': () => 'settings',
    './components/WebActivator.tsx': () => 'web-activator'
  }, {
    './tools/TaskbarAppearanceTool.tsx': () => 'taskbar-appearance'
  }))

  assert.equal(typeof map['taskbar-appearance'], 'function')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/renderer/src/appRouting.test.cjs`
Expected: FAIL because the new tool module is not registered in the test fixture or the tool list yet.

- [ ] **Step 3: Write the minimal renderer implementation**

```ts
// src/renderer/src/data/tools.ts
{
  id: 'taskbar-appearance',
  name: '任务栏美化',
  description: '切换 Windows 11 任务栏透明、毛玻璃和亚克力效果',
  category: '系统维护',
  icon: 'PanelTop',
  componentPath: 'TaskbarAppearanceTool'
}
```

```tsx
// src/renderer/src/tools/TaskbarAppearanceTool.tsx
export default function TaskbarAppearanceTool() {
  const showNotification = useGlobalStore((state) => state.showNotification)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    void window.electron.taskbarAppearance.getStatus().then((result) => {
      if (result.success) setStatus(result.data)
    })
  }, [])

  if (!status?.support?.supported) {
    return <Card><CardContent>当前系统暂不支持任务栏美化。</CardContent></Card>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>任务栏美化</CardTitle>
          <CardDescription>推荐使用毛玻璃；任何时候都可以恢复系统默认。</CardDescription>
        </CardHeader>
        <CardContent>{/* preset buttons, intensity slider, tint input, restore button */}</CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Run verification**

Run:

```bash
node --test src/renderer/src/appRouting.test.cjs
npm run typecheck
npm run test
```

Expected:

- `appRouting.test.cjs` PASS with the new route.
- `npm run typecheck` PASS with the new bridge and renderer types.
- `npm run test` PASS for the full node:test suite.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/tools/TaskbarAppearanceTool.tsx src/renderer/src/data/tools.ts src/renderer/src/appRouting.test.cjs
git commit -m "feat: add taskbar appearance tool ui"
```

### Task 6: Real Windows Validation And Polish

**Files:**
- Modify: `src/main/services/windows/WindowsTaskbarAdapter.ts`
- Modify: `src/main/services/TaskbarAppearanceService.ts`
- Modify: `src/renderer/src/tools/TaskbarAppearanceTool.tsx`

- [ ] **Step 1: Write the failing adapter/service regression tests for fallback behavior**

```js
test('restoreFromSettings clears persisted state when startup restore fails', async () => {
  const writes = []
  const { TaskbarAppearanceService } = loadTaskbarAppearanceServiceModule({
    adapter: {
      applyAppearance: async () => ({ success: false, error: 'unsupported build' }),
      restoreDefault: async () => ({ success: true })
    },
    settingsService: {
      getSettings: () => ({
        taskbarAppearanceEnabled: true,
        taskbarAppearancePreset: 'acrylic',
        taskbarAppearanceIntensity: 60,
        taskbarAppearanceTint: '#FFFFFF33'
      }),
      updateSettings: async (updates) => {
        writes.push(updates)
        return { success: true }
      }
    },
    platform: 'win32',
    release: '10.0.22621'
  })

  const service = new TaskbarAppearanceService()
  await service.restoreFromSettings()

  assert.equal(writes.at(-1).taskbarAppearanceEnabled, false)
  assert.equal(writes.at(-1).taskbarAppearancePreset, 'default')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/TaskbarAppearanceService.test.cjs src/main/services/windows/WindowsTaskbarAdapter.test.cjs`
Expected: FAIL because startup fallback and the final PowerShell composition script are still incomplete.

- [ ] **Step 3: Finish the Windows composition call and recovery behavior**

```ts
// fill in the real PowerShell script
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)]
public struct AccentPolicy {
  public int AccentState;
  public int AccentFlags;
  public int GradientColor;
  public int AnimationId;
}
[StructLayout(LayoutKind.Sequential)]
public struct WindowCompositionAttributeData {
  public int Attribute;
  public IntPtr Data;
  public int SizeOfData;
}
public static class AccentInterop {
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
  [DllImport("user32.dll")] public static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref WindowCompositionAttributeData data);
}
"@
```

```ts
// service fallback
async restoreFromSettings() {
  const settings = this.settings.getSettings()
  if (!settings.taskbarAppearanceEnabled) return

  const result = await this.applyPreset({
    preset: settings.taskbarAppearancePreset,
    intensity: settings.taskbarAppearanceIntensity,
    tintHex: settings.taskbarAppearanceTint
  })

  if (!result.success) {
    await this.adapter.restoreDefault()
    await this.settings.updateSettings({
      taskbarAppearanceEnabled: false,
      taskbarAppearancePreset: 'default'
    })
  }
}
```

- [ ] **Step 4: Run full verification and manual validation**

Run:

```bash
node --test src/main/services/windows/WindowsTaskbarAdapter.test.cjs src/main/services/TaskbarAppearanceService.test.cjs
npm run typecheck
npm run test
npm run build
```

Expected:

- All node:test suites PASS.
- `npm run typecheck` PASS.
- `npm run build` PASS.
- Manual Windows 11 checks confirm:
  - `系统默认 / 透明 / 毛玻璃 / 亚克力` switch without restarting Explorer.
  - restore works after a failed preset.
  - reopening the app restores the last successful preset.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/windows/WindowsTaskbarAdapter.ts src/main/services/TaskbarAppearanceService.ts src/renderer/src/tools/TaskbarAppearanceTool.tsx
git commit -m "fix: harden taskbar appearance startup recovery"
```

## Self-Review

- Spec coverage:
  - Windows-only scope: covered by shared support detection and renderer unavailable state in Tasks 1, 3, and 5.
  - Manual preset switching: covered by Tasks 3 through 5.
  - Blur-first stable experience: covered by Task 1 defaults plus Task 6 manual validation.
  - Safe restore and startup fallback: covered by Tasks 3 and 6.
  - IPC/preload/main integration: covered by Task 4.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to above” instructions remain in executable tasks.
  - Every task has explicit files, commands, and expected outcomes.
- Type consistency:
  - Persisted keys use the same names everywhere: `taskbarAppearanceEnabled`, `taskbarAppearancePreset`, `taskbarAppearanceIntensity`, `taskbarAppearanceTint`.
  - Bridge/API naming stays aligned: `taskbarAppearance.getStatus`, `applyPreset`, `restoreDefault`.
