# Auto Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-only in-app auto-update flow that checks GitHub Releases after startup, prompts before download, shows progress, and offers restart-and-install when the package is ready.

**Architecture:** Keep `electron-updater` isolated inside a new main-process `AppUpdateService`, translate updater events into a small shared state model, and expose only explicit update APIs through the preload bridge. Mount a single renderer update coordinator near the app root so startup checks can surface prompts globally, while settings owns the toggle and manual re-check affordances.

**Tech Stack:** Electron, `electron-updater`, Electron IPC, React 18, existing `window.electron` preload bridge, Node test runner (`node --test`)

---

## File Structure

- `package.json`
  - Add `electron-updater` runtime dependency
  - Add `build.publish` GitHub metadata for `tomfocker/onetool`
- `docs/distribution/windows-release.md`
  - Clarify that draft releases must be published before clients can see them
- `src/shared/appUpdate.ts`
  - Own the renderer-safe update state contract and state helpers
- `src/shared/appUpdate.test.cjs`
  - Lock the update state contract and transitions
- `src/shared/types.ts`
  - Extend `AppSettings` with `autoCheckForUpdates`
- `src/main/services/SettingsService.ts`
  - Default `autoCheckForUpdates` to `true`
- `src/main/services/StoreService.ts`
  - Keep store defaults consistent with the new setting
- `src/main/services/AppUpdateService.ts`
  - The only main-process unit that touches `electron-updater`
- `src/main/services/AppUpdateService.test.cjs`
  - Unit-test startup gating, state transitions, download/install guards, and event handling
- `src/main/ipc/updateIpc.ts`
  - Register explicit update IPC handlers and state push events
- `src/main/index.ts`
  - Initialize `AppUpdateService`, register IPC, and schedule startup auto-check after window bootstrap
- `src/preload/createElectronBridge.ts`
  - Add explicit `updates.*` bridge methods
- `src/preload/createElectronBridge.test.cjs`
  - Verify IPC method mapping and state subscription cleanup
- `src/renderer/src/types/electron.d.ts`
  - Type the new `window.electron.updates` bridge
- `src/renderer/src/hooks/useAppUpdate.ts`
  - Subscribe to update state and expose renderer actions
- `src/renderer/src/hooks/useAppUpdate.test.cjs`
  - Lock prompt and progress behavior in a pure helper-driven way
- `src/renderer/src/components/AppUpdatePrompt.tsx`
  - Display availability, download, progress, and restart UI
- `src/renderer/src/components/SettingsPage.tsx`
  - Add startup auto-check toggle, manual check button, and compact update status text
- `src/renderer/src/App.tsx`
  - Mount the global update prompt near `NotificationContainer`

### Task 1: Shared Contract, Settings Defaults, and Release Metadata

**Files:**
- Create: `src/shared/appUpdate.ts`
- Test: `src/shared/appUpdate.test.cjs`
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/SettingsService.ts`
- Modify: `src/main/services/StoreService.ts`
- Modify: `package.json`
- Modify: `docs/distribution/windows-release.md`

- [ ] **Step 1: Write the failing shared-contract test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createIdleUpdateState,
  createAvailableUpdateState,
  createDownloadingUpdateState
} = require('./appUpdate.ts')

test('createIdleUpdateState seeds the packaged app version with no update target', () => {
  assert.deepEqual(createIdleUpdateState('1.0.0'), {
    status: 'idle',
    currentVersion: '1.0.0',
    latestVersion: null,
    releaseNotes: null,
    progressPercent: null,
    errorMessage: null
  })
})

test('createAvailableUpdateState stores release metadata without download progress', () => {
  assert.deepEqual(
    createAvailableUpdateState({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: 'Bug fixes'
    }),
    {
      status: 'available',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: 'Bug fixes',
      progressPercent: null,
      errorMessage: null
    }
  )
})

test('createDownloadingUpdateState rounds progress to a renderer-safe integer', () => {
  assert.equal(
    createDownloadingUpdateState({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      progressPercent: 48.6
    }).progressPercent,
    49
  )
})
```

- [ ] **Step 2: Run the shared-contract test to verify it fails**

Run: `node --test src/shared/appUpdate.test.cjs`

Expected: FAIL with `Cannot find module './appUpdate.ts'` or missing export errors.

- [ ] **Step 3: Write the minimal shared contract and settings defaults**

```ts
// src/shared/appUpdate.ts
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string | null
  progressPercent: number | null
  errorMessage: string | null
}

export function createIdleUpdateState(currentVersion: string): UpdateState {
  return {
    status: 'idle',
    currentVersion,
    latestVersion: null,
    releaseNotes: null,
    progressPercent: null,
    errorMessage: null
  }
}
```

```ts
// src/shared/types.ts
export interface AppSettings {
  recorderHotkey: string
  screenshotHotkey: string
  floatBallHotkey: string
  screenshotSavePath: string
  autoSaveScreenshot: boolean
  clipboardHotkey: string
  minimizeToTray: boolean
  autoCheckForUpdates: boolean
  translateApiUrl: string
  translateApiKey: string
  translateModel: string
}
```

```ts
// src/main/services/SettingsService.ts and StoreService.ts defaults
autoCheckForUpdates: true
```

```json
// package.json
{
  "dependencies": {
    "electron-updater": "^6.3.9"
  },
  "build": {
    "publish": [
      {
        "provider": "github",
        "owner": "tomfocker",
        "repo": "onetool"
      }
    ]
  }
}
```

```md
<!-- docs/distribution/windows-release.md -->
- 推送标签后会先生成 draft release
- 只有把 draft 发布为正式 release，客户端自动更新才能看到该版本
```

- [ ] **Step 4: Run the shared-contract test to verify it passes**

Run: `node --test src/shared/appUpdate.test.cjs`

Expected: PASS for all shared update-state tests.

- [ ] **Step 5: Run targeted type/build safety checks**

Run: `npm run typecheck`

Expected: PASS with no `AppSettings` missing-property errors.

- [ ] **Step 6: Commit**

```bash
git add package.json docs/distribution/windows-release.md src/shared/appUpdate.ts src/shared/appUpdate.test.cjs src/shared/types.ts src/main/services/SettingsService.ts src/main/services/StoreService.ts
git commit -m "feat: add shared app update contract"
```

### Task 2: Main-Process Update Service

**Files:**
- Create: `src/main/services/AppUpdateService.ts`
- Test: `src/main/services/AppUpdateService.test.cjs`

- [ ] **Step 1: Write the failing service test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { AppUpdateService } = require('./AppUpdateService.ts')

function createUpdaterStub() {
  const listeners = new Map()
  return {
    listeners,
    autoDownload: true,
    on(event, handler) {
      listeners.set(event, handler)
    },
    checkForUpdates: async () => ({})
  }
}

test('startup auto-check is skipped while app is unpackaged', async () => {
  const updater = createUpdaterStub()
  let checked = false
  updater.checkForUpdates = async () => {
    checked = true
  }

  const service = new AppUpdateService({
    updater,
    currentVersion: '1.0.0',
    isPackaged: false,
    isDevelopment: false,
    autoCheckForUpdates: true,
    schedule: (fn) => fn(),
    logger: { info() {}, warn() {}, error() {} }
  })

  await service.scheduleStartupCheck()
  assert.equal(checked, false)
  assert.equal(service.getState().status, 'idle')
})

test('downloadUpdate refuses to run before an update is available', async () => {
  const service = new AppUpdateService({
    updater: createUpdaterStub(),
    currentVersion: '1.0.0',
    isPackaged: true,
    isDevelopment: false,
    autoCheckForUpdates: true,
    schedule: (fn) => fn(),
    logger: { info() {}, warn() {}, error() {} }
  })

  const result = await service.downloadUpdate()
  assert.equal(result.success, false)
  assert.match(result.error, /没有可下载的更新/)
})
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `node --test src/main/services/AppUpdateService.test.cjs`

Expected: FAIL because `AppUpdateService.ts` does not exist yet.

- [ ] **Step 3: Write the minimal update service**

```ts
import { EventEmitter } from 'events'
import { createIdleUpdateState, type UpdateState } from '../../shared/appUpdate'
import type { IpcResponse } from '../../shared/types'

export class AppUpdateService extends EventEmitter {
  private state: UpdateState

  constructor(private deps: {
    updater: {
      autoDownload: boolean
      on: (event: string, handler: (...args: any[]) => void) => void
      checkForUpdates: () => Promise<unknown>
      downloadUpdate?: () => Promise<unknown>
      quitAndInstall?: () => void
    }
    currentVersion: string
    isPackaged: boolean
    isDevelopment: boolean
    autoCheckForUpdates: boolean
    schedule: (task: () => void) => void
    logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void }
  }) {
    super()
    this.state = createIdleUpdateState(deps.currentVersion)
    this.deps.updater.autoDownload = false
    this.registerUpdaterEvents()
  }

  getState(): UpdateState {
    return this.state
  }
}
```

Add the service rules in the same task:

- guard startup checks with `isPackaged`, `!isDevelopment`, and `autoCheckForUpdates`
- transition to `checking` before `checkForUpdates()`
- map updater events to shared `UpdateState`
- expose `checkForUpdates()`, `downloadUpdate()`, and `quitAndInstall()` as `Promise<IpcResponse>`
- emit `'state-changed'` whenever state changes

- [ ] **Step 4: Expand the test suite for updater event transitions**

```js
test('update-downloaded marks the service ready to install', async () => {
  const updater = createUpdaterStub()
  const service = new AppUpdateService({
    updater,
    currentVersion: '1.0.0',
    isPackaged: true,
    isDevelopment: false,
    autoCheckForUpdates: true,
    schedule: (fn) => fn(),
    logger: { info() {}, warn() {}, error() {} }
  })

  updater.listeners.get('update-downloaded')({}, { version: '1.1.0', releaseNotes: 'Ready' })
  assert.equal(service.getState().status, 'downloaded')
  assert.equal(service.getState().latestVersion, '1.1.0')
})
```

- [ ] **Step 5: Run the service tests to verify they pass**

Run: `node --test src/main/services/AppUpdateService.test.cjs`

Expected: PASS for gating, event-mapping, and guard-behavior tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/AppUpdateService.ts src/main/services/AppUpdateService.test.cjs
git commit -m "feat: add app update service"
```

### Task 3: IPC Registration and Preload Bridge

**Files:**
- Create: `src/main/ipc/updateIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/createElectronBridge.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/createElectronBridge.test.cjs`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Write the failing preload bridge test**

```js
test('createElectronBridge exposes explicit update methods and subscriptions', () => {
  const bridge = createElectronBridge({ ipcRenderer: mocks.ipcRenderer, webUtils: mocks.webUtils })

  bridge.updates.getState()
  bridge.updates.checkForUpdates()
  bridge.updates.downloadUpdate()
  bridge.updates.quitAndInstall()

  assert.deepEqual(mocks.invoked, [
    ['updates-get-state'],
    ['updates-check'],
    ['updates-download'],
    ['updates-quit-and-install']
  ])

  const unsubscribe = bridge.updates.onStateChanged(() => {})
  assert.equal(typeof unsubscribe, 'function')
})
```

- [ ] **Step 2: Run the preload bridge test to verify it fails**

Run: `node --test src/preload/createElectronBridge.test.cjs`

Expected: FAIL because `bridge.updates` is undefined.

- [ ] **Step 3: Add update IPC registration and preload bridge wiring**

```ts
// src/main/ipc/updateIpc.ts
import { ipcMain, BrowserWindow } from 'electron'
import { appUpdateService } from '../services/AppUpdateService'

export function registerUpdateIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('updates-get-state', () => ({ success: true, data: appUpdateService.getState() }))
  ipcMain.handle('updates-check', () => appUpdateService.checkForUpdates())
  ipcMain.handle('updates-download', () => appUpdateService.downloadUpdate())
  ipcMain.handle('updates-quit-and-install', () => appUpdateService.quitAndInstall())

  appUpdateService.on('state-changed', (state) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updates-state-changed', state)
    }
  })
}
```

```ts
// src/preload/createElectronBridge.ts
const updatesAPI = {
  getState: () => ipcRenderer.invoke('updates-get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates-check'),
  downloadUpdate: () => ipcRenderer.invoke('updates-download'),
  quitAndInstall: () => ipcRenderer.invoke('updates-quit-and-install'),
  onStateChanged: (callback) => onChannel('updates-state-changed', callback)
}
```

```ts
// src/renderer/src/types/electron.d.ts
updates: {
  getState: () => Promise<IpcResponse<UpdateState>>
  checkForUpdates: () => Promise<IpcResponse<UpdateState>>
  downloadUpdate: () => Promise<IpcResponse<UpdateState>>
  quitAndInstall: () => Promise<IpcResponse>
  onStateChanged: (callback: (state: UpdateState) => void) => () => void
}
```

- [ ] **Step 4: Register the update IPC and startup scheduling in `src/main/index.ts`**

```ts
registerUpdateIpc(() => mainWindow)

appUpdateService.configure({
  autoCheckForUpdates: settingsService.getSettings().autoCheckForUpdates
})

mainWindow.on('ready-to-show', () => {
  setTimeout(() => {
    appUpdateService.scheduleStartupCheck()
  }, 5000)
})

settingsService.on('changed', (newSettings) => {
  appUpdateService.configure({
    autoCheckForUpdates: newSettings.autoCheckForUpdates
  })
})
```

- [ ] **Step 5: Run the preload bridge tests to verify they pass**

Run: `node --test src/preload/createElectronBridge.test.cjs`

Expected: PASS for explicit update IPC mapping and state subscription cleanup.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/updateIpc.ts src/main/index.ts src/preload/createElectronBridge.ts src/preload/index.ts src/preload/createElectronBridge.test.cjs src/renderer/src/types/electron.d.ts
git commit -m "feat: wire app update bridge"
```

### Task 4: Renderer Update Hook and Global Prompt

**Files:**
- Create: `src/renderer/src/hooks/useAppUpdate.ts`
- Create: `src/renderer/src/hooks/useAppUpdate.test.cjs`
- Create: `src/renderer/src/components/AppUpdatePrompt.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Write the failing renderer helper test**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { deriveUpdatePromptState } = require('./useAppUpdate.ts')

test('deriveUpdatePromptState requests confirmation when a new update is available', () => {
  assert.deepEqual(
    deriveUpdatePromptState({
      status: 'available',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: 'Bug fixes',
      progressPercent: null,
      errorMessage: null
    }),
    {
      mode: 'confirm-download',
      title: '发现新版本 1.1.0',
      progressLabel: null
    }
  )
})
```

- [ ] **Step 2: Run the renderer helper test to verify it fails**

Run: `node --test src/renderer/src/hooks/useAppUpdate.test.cjs`

Expected: FAIL because `useAppUpdate.ts` does not exist.

- [ ] **Step 3: Implement the hook and prompt-state helper**

```ts
// src/renderer/src/hooks/useAppUpdate.ts
import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/appUpdate'

export function deriveUpdatePromptState(state: UpdateState) {
  if (state.status === 'available') {
    return {
      mode: 'confirm-download',
      title: `发现新版本 ${state.latestVersion}`,
      progressLabel: null
    }
  }

  if (state.status === 'downloading') {
    return {
      mode: 'downloading',
      title: `正在下载 ${state.latestVersion}`,
      progressLabel: `${state.progressPercent ?? 0}%`
    }
  }

  if (state.status === 'downloaded') {
    return {
      mode: 'restart',
      title: '更新已准备完成',
      progressLabel: null
    }
  }

  return null
}
```

The hook should:

- fetch `window.electron.updates.getState()` on mount
- subscribe to `window.electron.updates.onStateChanged`
- expose `checkForUpdates`, `downloadUpdate`, and `quitAndInstall`
- keep the current `UpdateState` and a derived prompt model

- [ ] **Step 4: Implement the global prompt component and mount it in `App.tsx`**

```tsx
// src/renderer/src/components/AppUpdatePrompt.tsx
export function AppUpdatePrompt() {
  const { prompt, state, downloadUpdate, quitAndInstall, dismissError } = useAppUpdate()

  if (!prompt) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] rounded-3xl border bg-background/95 p-5 shadow-2xl backdrop-blur">
      <h3 className="text-sm font-bold">{prompt.title}</h3>
      {state.releaseNotes ? <p className="mt-2 text-xs text-muted-foreground">{state.releaseNotes}</p> : null}
      {prompt.mode === 'downloading' ? <Progress value={state.progressPercent ?? 0} className="mt-4" /> : null}
      <div className="mt-4 flex justify-end gap-2">
        {prompt.mode === 'confirm-download' ? <Button onClick={() => downloadUpdate()}>下载更新</Button> : null}
        {prompt.mode === 'restart' ? <Button onClick={() => quitAndInstall()}>重启安装</Button> : null}
      </div>
    </div>
  )
}
```

```tsx
// src/renderer/src/App.tsx
import { AppUpdatePrompt } from '@/components/AppUpdatePrompt'

...
<NotificationContainer />
<AppUpdatePrompt />
```

- [ ] **Step 5: Run the renderer helper tests to verify they pass**

Run: `node --test src/renderer/src/hooks/useAppUpdate.test.cjs`

Expected: PASS for available/downloading/downloaded prompt-state derivation.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/hooks/useAppUpdate.ts src/renderer/src/hooks/useAppUpdate.test.cjs src/renderer/src/components/AppUpdatePrompt.tsx src/renderer/src/App.tsx
git commit -m "feat: add renderer app update prompt"
```

### Task 5: Settings Integration, Manual Checks, and Final Verification

**Files:**
- Modify: `src/renderer/src/components/SettingsPage.tsx`
- Modify: `src/main/services/AppUpdateService.ts`
- Modify: `src/main/index.ts`
- Modify: `docs/distribution/windows-release.md`

- [ ] **Step 1: Write the failing settings/status helper test**

```js
test('deriveUpdateStatusText surfaces the latest downloaded update clearly', () => {
  const { deriveUpdateStatusText } = require('./useAppUpdate.ts')

  assert.equal(
    deriveUpdateStatusText({
      status: 'downloaded',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      releaseNotes: null,
      progressPercent: null,
      errorMessage: null
    }),
    '新版本 1.1.0 已下载，重启后安装'
  )
})
```

- [ ] **Step 2: Run the renderer helper test to verify it fails**

Run: `node --test src/renderer/src/hooks/useAppUpdate.test.cjs`

Expected: FAIL because `deriveUpdateStatusText` is missing.

- [ ] **Step 3: Implement the settings UI and manual check action**

```tsx
// src/renderer/src/components/SettingsPage.tsx
const { state: updateState, checkForUpdates } = useAppUpdate()

const handleAutoCheckForUpdatesChange = async (checked: boolean) => {
  const result = await updateSettings({ autoCheckForUpdates: checked })
  if (!result.success) {
    console.error('SettingsPage: Failed to update autoCheckForUpdates:', result.error)
  }
}

<SettingItem
  icon={<Rocket size={18} className="text-sky-500" />}
  title="启动时自动检查更新"
  description="应用启动后后台检查 GitHub Release 中的新版本"
  checked={settings.autoCheckForUpdates}
  onCheckedChange={handleAutoCheckForUpdatesChange}
/>

<Button variant="outline" size="sm" onClick={() => checkForUpdates()} className="rounded-xl">
  立即检查更新
</Button>

<p className="text-xs text-muted-foreground">
  当前版本 {updateState.currentVersion} · {deriveUpdateStatusText(updateState)}
</p>
```

Also finish the main-process integration in this task:

- `AppUpdateService.configure()` should update the auto-check flag in memory
- startup scheduling should be idempotent so settings changes do not trigger duplicate timers
- when a manual check finds `not-available`, send a benign state transition instead of a disruptive prompt

- [ ] **Step 4: Run focused tests and full verification**

Run:

```bash
node --test src/shared/appUpdate.test.cjs src/main/services/AppUpdateService.test.cjs src/preload/createElectronBridge.test.cjs src/renderer/src/hooks/useAppUpdate.test.cjs
npm run test
npm run build
```

Expected:

- focused update tests PASS
- full suite PASS
- build PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SettingsPage.tsx src/main/services/AppUpdateService.ts src/main/index.ts docs/distribution/windows-release.md
git commit -m "feat: integrate auto update settings and verification"
```

## Self-Review

- Spec coverage:
  - startup background check: Task 2 + Task 3 + Task 5
  - explicit preload bridge: Task 3
  - renderer prompt and progress UI: Task 4
  - settings toggle and manual check: Task 5
  - GitHub publish metadata and release visibility rules: Task 1 + Task 5
- Placeholder scan:
  - no `TODO`/`TBD`
  - every task includes exact file paths, code targets, commands, and commit points
- Type consistency:
  - `UpdateState`, `autoCheckForUpdates`, `AppUpdateService`, and `window.electron.updates` are named consistently across shared, main, preload, and renderer tasks
