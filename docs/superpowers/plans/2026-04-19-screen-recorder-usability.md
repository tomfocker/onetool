# Screen Recorder Usability Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing screen recorder so area recording supports preview and numeric adjustment before start, and active recordings collapse into a usable floating controller instead of leaving the experience split across the main page and a passive indicator.

**Architecture:** Keep FFmpeg capture and the multi-display selection overlay, but move recorder lifecycle into a single session model shared across main, preload, and renderer. Add a small shared helper module for bounds/session logic, let the main process own the authoritative session snapshot, and let the renderer edit a draft plus react to session updates.

**Tech Stack:** TypeScript, Electron main/preload/renderer, Node `node:test`, existing `npm run typecheck` scripts, FFmpeg via `fluent-ffmpeg`

---

## File Structure

- Create: `src/shared/screenRecorderSession.ts`
  Pure helpers for recorder session status, bounds clamping, numeric nudge logic, output-path normalization, and session snapshot shaping.
- Create: `src/shared/screenRecorderSession.test.cjs`
  Node test coverage for the pure recorder-session helpers.
- Modify: `src/shared/ipc-schemas.ts`
  Add strict schemas for selection preview requests and recorder session payloads passed through IPC.
- Modify: `src/main/services/ScreenRecorderService.ts`
  Replace scattered booleans with a session object, prepare selection previews, emit session updates, and upgrade the indicator window into a mini controller.
- Modify: `src/main/ipc/screenRecorderIpc.ts`
  Expose new IPC for preparing area selections and expanding the recorder panel.
- Modify: `src/preload/index.ts`
  Surface the new screen-recorder APIs and event subscriptions to the renderer.
- Modify: `src/renderer/src/types/electron.d.ts`
  Keep preload and renderer contracts in sync.
- Modify: `src/renderer/src/hooks/useScreenRecorder.ts`
  Refactor from loose local fields into draft state + synchronized session state.
- Modify: `src/renderer/src/tools/ScreenRecorderTool.tsx`
  Rebuild the UI into a staged flow with selection preview, numeric micro-adjustment, locked recording state, and corrected copy.

### Task 1: Build Shared Recorder Session Helpers

**Files:**
- Create: `src/shared/screenRecorderSession.ts`
- Test: `src/shared/screenRecorderSession.test.cjs`

- [ ] **Step 1: Write the failing recorder-session tests**

Create `src/shared/screenRecorderSession.test.cjs`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  clampRecorderBounds,
  ensureRecorderOutputPath,
  isRecorderSelectionValid,
  nudgeRecorderBounds,
  toRecorderSessionUpdate
} = require('./screenRecorderSession.ts')

test('clampRecorderBounds keeps an area selection inside the current display', () => {
  assert.deepEqual(
    clampRecorderBounds(
      { x: -20, y: 10, width: 220, height: 120 },
      { x: 0, y: 0, width: 1920, height: 1080 }
    ),
    { x: 0, y: 10, width: 220, height: 120 }
  )
})

test('nudgeRecorderBounds respects display edges and minimum size', () => {
  assert.deepEqual(
    nudgeRecorderBounds(
      { x: 1860, y: 100, width: 120, height: 120 },
      'x',
      10,
      { x: 0, y: 0, width: 1920, height: 1080 },
      64
    ),
    { x: 1800, y: 100, width: 120, height: 120 }
  )
})

test('isRecorderSelectionValid rejects tiny selections', () => {
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 48, height: 200 }, 64), false)
  assert.equal(isRecorderSelectionValid({ x: 0, y: 0, width: 128, height: 200 }, 64), true)
})

test('ensureRecorderOutputPath rewrites mismatched extensions', () => {
  assert.equal(
    ensureRecorderOutputPath('C:/Users/Admin/Desktop/demo.gif', 'mp4'),
    'C:/Users/Admin/Desktop/demo.mp4'
  )
  assert.equal(
    ensureRecorderOutputPath('C:/Users/Admin/Desktop/demo', 'gif'),
    'C:/Users/Admin/Desktop/demo.gif'
  )
})

test('toRecorderSessionUpdate returns a renderer-safe snapshot', () => {
  assert.deepEqual(
    toRecorderSessionUpdate({
      status: 'ready-to-record',
      mode: 'area',
      outputPath: 'C:/Users/Admin/Desktop/demo.mp4',
      recordingTime: '00:00:00',
      selectionBounds: { x: 12, y: 24, width: 640, height: 360 },
      selectionPreviewDataUrl: 'data:image/png;base64,abc',
      selectedDisplayId: 'DISPLAY1'
    }),
    {
      status: 'ready-to-record',
      mode: 'area',
      outputPath: 'C:/Users/Admin/Desktop/demo.mp4',
      recordingTime: '00:00:00',
      selectionBounds: { x: 12, y: 24, width: 640, height: 360 },
      selectionPreviewDataUrl: 'data:image/png;base64,abc',
      selectedDisplayId: 'DISPLAY1'
    }
  )
})
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `node --test src/shared/screenRecorderSession.test.cjs`

Expected: FAIL with `Cannot find module './screenRecorderSession.ts'`.

- [ ] **Step 3: Implement the shared helper module**

Create `src/shared/screenRecorderSession.ts`:

```ts
export type RecorderSessionStatus =
  | 'idle'
  | 'selecting-area'
  | 'ready-to-record'
  | 'recording'
  | 'finishing'

export type RecorderMode = 'full' | 'area'

export interface RecorderBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RecorderDisplayBounds extends RecorderBounds {}

export interface RecorderSessionUpdate {
  status: RecorderSessionStatus
  mode: RecorderMode
  outputPath: string
  recordingTime: string
  selectionBounds: RecorderBounds | null
  selectionPreviewDataUrl: string | null
  selectedDisplayId: string | null
}

export function clampRecorderBounds(
  bounds: RecorderBounds,
  display: RecorderDisplayBounds
): RecorderBounds {
  const width = Math.min(bounds.width, display.width)
  const height = Math.min(bounds.height, display.height)
  const maxX = display.x + display.width - width
  const maxY = display.y + display.height - height

  return {
    x: Math.max(display.x, Math.min(bounds.x, maxX)),
    y: Math.max(display.y, Math.min(bounds.y, maxY)),
    width,
    height
  }
}

export function isRecorderSelectionValid(bounds: RecorderBounds | null, minSize = 64): boolean {
  return !!bounds && bounds.width >= minSize && bounds.height >= minSize
}

export function nudgeRecorderBounds(
  bounds: RecorderBounds,
  field: 'x' | 'y' | 'width' | 'height',
  delta: number,
  display: RecorderDisplayBounds,
  minSize = 64
): RecorderBounds {
  const next = { ...bounds, [field]: bounds[field] + delta }
  next.width = Math.max(minSize, next.width)
  next.height = Math.max(minSize, next.height)
  return clampRecorderBounds(next, display)
}

export function ensureRecorderOutputPath(outputPath: string, format: 'mp4' | 'gif'): string {
  const ext = `.${format}`
  if (outputPath.toLowerCase().endsWith(ext)) return outputPath
  if (/\.[^/.]+$/.test(outputPath)) return outputPath.replace(/\.[^/.]+$/, ext)
  return `${outputPath}${ext}`
}

export function toRecorderSessionUpdate(update: RecorderSessionUpdate): RecorderSessionUpdate {
  return {
    status: update.status,
    mode: update.mode,
    outputPath: update.outputPath,
    recordingTime: update.recordingTime,
    selectionBounds: update.selectionBounds,
    selectionPreviewDataUrl: update.selectionPreviewDataUrl,
    selectedDisplayId: update.selectedDisplayId
  }
}
```

- [ ] **Step 4: Run the shared helper tests and make sure they pass**

Run: `node --test src/shared/screenRecorderSession.test.cjs`

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Commit the shared helper layer**

```bash
git add src/shared/screenRecorderSession.ts src/shared/screenRecorderSession.test.cjs
git commit -m "test: add screen recorder session helpers"
```

### Task 2: Refactor Main-Process Recorder Session and IPC

**Files:**
- Modify: `src/main/services/ScreenRecorderService.ts`
- Modify: `src/main/ipc/screenRecorderIpc.ts`
- Modify: `src/shared/ipc-schemas.ts`
- Reuse Test: `src/shared/screenRecorderSession.test.cjs`

- [ ] **Step 1: Add a failing pure test for the selection-preview session snapshot**

Append to `src/shared/screenRecorderSession.test.cjs`:

```js
test('toRecorderSessionUpdate keeps preview metadata for ready-to-record state', () => {
  const snapshot = toRecorderSessionUpdate({
    status: 'ready-to-record',
    mode: 'area',
    outputPath: 'C:/Users/Admin/Desktop/demo.mp4',
    recordingTime: '00:00:00',
    selectionBounds: { x: 120, y: 240, width: 800, height: 450 },
    selectionPreviewDataUrl: 'data:image/png;base64,preview',
    selectedDisplayId: '2'
  })

  assert.equal(snapshot.selectionPreviewDataUrl, 'data:image/png;base64,preview')
  assert.deepEqual(snapshot.selectionBounds, { x: 120, y: 240, width: 800, height: 450 })
})
```

- [ ] **Step 2: Run the test file and confirm the new assertion fails until wiring is complete**

Run: `node --test src/shared/screenRecorderSession.test.cjs`

Expected: FAIL if the helper shape or import list is not updated yet.

- [ ] **Step 3: Extend the IPC schemas for session and selection preparation**

Update `src/shared/ipc-schemas.ts`:

```ts
export const RecorderBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
})

export const RecorderSelectionPreviewSchema = z.object({
  bounds: RecorderBoundsSchema,
  displayBounds: RecorderBoundsSchema,
  previewDataUrl: z.string().min(1)
})

export const RecorderSessionUpdateSchema = z.object({
  status: z.enum(['idle', 'selecting-area', 'ready-to-record', 'recording', 'finishing']),
  mode: z.enum(['full', 'area']),
  outputPath: z.string(),
  recordingTime: z.string(),
  selectionBounds: RecorderBoundsSchema.nullable(),
  selectionPreviewDataUrl: z.string().nullable(),
  selectedDisplayId: z.string().nullable()
})
```

- [ ] **Step 4: Replace scattered recorder flags with a session object in the main service**

In `src/main/services/ScreenRecorderService.ts`, add a session model and helpers near the top of the class:

```ts
private session = {
  status: 'idle' as RecorderSessionStatus,
  mode: 'full' as RecorderMode,
  outputPath: '',
  recordingTime: '00:00:00',
  selectionBounds: null as RecorderBounds | null,
  selectionPreviewDataUrl: null as string | null,
  selectedDisplayId: null as string | null
}

private emitSessionUpdate() {
  if (!this.mainWindow || this.mainWindow.isDestroyed()) return
  this.mainWindow.webContents.send(
    'screen-recorder-session-updated',
    toRecorderSessionUpdate(this.session)
  )
}

private setSession(
  patch: Partial<typeof this.session>
) {
  this.session = { ...this.session, ...patch }
  this.emitSessionUpdate()
}
```

Then add a selection-preparation method:

```ts
async prepareSelection(bounds: RecorderBounds): Promise<IpcResponse<{
  bounds: RecorderBounds
  displayBounds: RecorderBounds
  previewDataUrl: string
}>> {
  const { screen } = require('electron')
  const targetDisplay = screen.getDisplayNearestPoint({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  })
  const displayBounds = targetDisplay.bounds
  const clamped = clampRecorderBounds(bounds, displayBounds)
  const preview = await screenshotService.capture(clamped)

  if (!preview.success || !preview.data) {
    return { success: false, error: preview.error || '预览图生成失败' }
  }

  this.setSession({
    status: 'ready-to-record',
    mode: 'area',
    selectionBounds: clamped,
    selectionPreviewDataUrl: preview.data,
    selectedDisplayId: targetDisplay.id.toString()
  })

  return {
    success: true,
    data: {
      bounds: clamped,
      displayBounds,
      previewDataUrl: preview.data
    }
  }
}
```

Also update `start()` and `stop()` so they set `recording`, `finishing`, `idle`, `recordingTime`, and preserve the last draft instead of clearing it on success or failure.

- [ ] **Step 5: Upgrade the indicator window into a mini controller and wire IPC**

Replace the current HTML inside `createIndicatorWindow()` with:

```ts
const htmlContent = `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { margin: 0; background: transparent; font-family: "Segoe UI", sans-serif; }
      .shell {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 8px;
        padding: 10px 14px;
        color: white;
        border-radius: 999px;
        background: rgba(12, 12, 12, 0.86);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 12px 30px rgba(0,0,0,0.25);
      }
      .dot { width: 10px; height: 10px; border-radius: 50%; background: #ef4444; animation: pulse 1s infinite alternate; }
      .meta { display: flex; flex-direction: column; line-height: 1.2; }
      .time { font-family: Consolas, monospace; opacity: 0.92; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 6px 10px;
        color: white;
        background: rgba(255,255,255,0.12);
        cursor: pointer;
      }
      .danger { background: #ef4444; }
      @keyframes pulse { from { opacity: 0.45; } to { opacity: 1; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="dot"></div>
      <div class="meta">
        <strong id="title">正在录制区域</strong>
        <span class="time" id="time">00:00:00</span>
      </div>
      <button id="expand">返回面板</button>
      <button id="stop" class="danger">停止</button>
    </div>
    <script>
      const { ipcRenderer } = require('electron')
      document.getElementById('expand').addEventListener('click', () => ipcRenderer.invoke('screen-recorder-expand-panel'))
      document.getElementById('stop').addEventListener('click', () => ipcRenderer.invoke('screen-recorder-stop'))
      ipcRenderer.on('update-time', (_event, time) => {
        document.getElementById('time').textContent = time
      })
      ipcRenderer.on('update-mode', (_event, label) => {
        document.getElementById('title').textContent = label
      })
    </script>
  </body>
</html>
`
```

Then update `src/main/ipc/screenRecorderIpc.ts`:

```ts
ipcMain.handle('screen-recorder-prepare-selection', async (_event, bounds) => {
  const validBounds = RecorderBoundsSchema.parse(bounds)
  return screenRecorderService.prepareSelection(validBounds)
})

ipcMain.handle('screen-recorder-expand-panel', async () => {
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
  return { success: true }
})
```

- [ ] **Step 6: Run node and type checks**

Run:

```bash
node --test src/shared/screenRecorderSession.test.cjs
npm run typecheck:node
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the main-process session refactor**

```bash
git add src/shared/ipc-schemas.ts src/main/services/ScreenRecorderService.ts src/main/ipc/screenRecorderIpc.ts
git commit -m "feat: add recorder session lifecycle in main process"
```

### Task 3: Extend Preload and Refactor the Recorder Hook

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/renderer/src/hooks/useScreenRecorder.ts`
- Reuse Test: `src/shared/screenRecorderSession.test.cjs`

- [ ] **Step 1: Add a failing helper test for output-path coercion used by the hook**

Append to `src/shared/screenRecorderSession.test.cjs`:

```js
test('ensureRecorderOutputPath keeps the current extension when it already matches', () => {
  assert.equal(
    ensureRecorderOutputPath('C:/Users/Admin/Desktop/demo.mp4', 'mp4'),
    'C:/Users/Admin/Desktop/demo.mp4'
  )
})
```

- [ ] **Step 2: Run the test file and confirm the new case fails until the helper export is wired**

Run: `node --test src/shared/screenRecorderSession.test.cjs`

Expected: FAIL if the helper export or import list is incomplete.

- [ ] **Step 3: Expose the new preload APIs and renderer types**

Update `src/preload/index.ts` inside `screenRecorderAPI`:

```ts
prepareSelection: (bounds: { x: number; y: number; width: number; height: number }) => {
  return ipcRenderer.invoke('screen-recorder-prepare-selection', bounds)
},
expandPanel: () => {
  return ipcRenderer.invoke('screen-recorder-expand-panel')
},
onSessionUpdated: (callback: (data: {
  status: 'idle' | 'selecting-area' | 'ready-to-record' | 'recording' | 'finishing'
  mode: 'full' | 'area'
  outputPath: string
  recordingTime: string
  selectionBounds: { x: number; y: number; width: number; height: number } | null
  selectionPreviewDataUrl: string | null
  selectedDisplayId: string | null
}) => void) => {
  const handler = (_event: any, data: any) => callback(data)
  ipcRenderer.on('screen-recorder-session-updated', handler)
  return () => ipcRenderer.removeListener('screen-recorder-session-updated', handler)
}
```

Mirror that contract in `src/renderer/src/types/electron.d.ts`.

- [ ] **Step 4: Rewrite `useScreenRecorder` around draft state and session state**

Replace the top of `src/renderer/src/hooks/useScreenRecorder.ts` with a clearer model:

```ts
const [session, setSession] = useState({
  status: 'idle' as const,
  mode: 'full' as const,
  outputPath: '',
  recordingTime: '00:00:00',
  selectionBounds: null as RecorderBounds | null,
  selectionPreviewDataUrl: null as string | null,
  selectedDisplayId: null as string | null
})

const [draft, setDraft] = useState({
  outputPath: '',
  format: 'mp4' as 'mp4' | 'gif',
  fps: 30,
  quality: 'medium' as 'low' | 'medium' | 'high',
  recordingMode: 'full' as 'full' | 'area',
  selectedScreen: null as { id: string; name: string; display_id: string } | null
})

const prepareSelection = useCallback(async (bounds: RecorderBounds) => {
  const res = await window.electron.screenRecorder.prepareSelection(bounds)
  if (!res.success || !res.data) return res
  setSession((current) => ({
    ...current,
    status: 'ready-to-record',
    mode: 'area',
    selectionBounds: res.data.bounds,
    selectionPreviewDataUrl: res.data.previewDataUrl,
    selectedDisplayId: res.data.displayBounds.x.toString()
  }))
  return res
}, [])
```

Then update `startRecording()` to use `ensureRecorderOutputPath()` and `session.selectionBounds`, and subscribe to `onSessionUpdated()` so the renderer stops guessing actual recorder status.

- [ ] **Step 5: Run shared tests and full typecheck**

Run:

```bash
node --test src/shared/screenRecorderSession.test.cjs
npm run typecheck
```

Expected: PASS for the node tests and both TypeScript projects.

- [ ] **Step 6: Commit the preload and hook contract changes**

```bash
git add src/preload/index.ts src/renderer/src/types/electron.d.ts src/renderer/src/hooks/useScreenRecorder.ts
git commit -m "feat: sync recorder session state to renderer"
```

### Task 4: Rebuild the Recorder Page into a Staged Flow

**Files:**
- Modify: `src/renderer/src/tools/ScreenRecorderTool.tsx`
- Modify: `src/renderer/src/hooks/useScreenRecorder.ts`
- Test/Verify: `src/shared/screenRecorderSession.test.cjs`

- [ ] **Step 1: Add a failing session-helper test for minimum-size validation**

Append to `src/shared/screenRecorderSession.test.cjs`:

```js
test('nudgeRecorderBounds never shrinks width below the minimum size', () => {
  assert.deepEqual(
    nudgeRecorderBounds(
      { x: 100, y: 100, width: 80, height: 120 },
      'width',
      -40,
      { x: 0, y: 0, width: 1920, height: 1080 },
      64
    ),
    { x: 100, y: 100, width: 64, height: 120 }
  )
})
```

- [ ] **Step 2: Run the test file and verify the new guard fails first**

Run: `node --test src/shared/screenRecorderSession.test.cjs`

Expected: FAIL until `nudgeRecorderBounds()` enforces the minimum width guard.

- [ ] **Step 3: Rebuild the page into explicit sections**

In `src/renderer/src/tools/ScreenRecorderTool.tsx`, split the page into:

```tsx
<section>
  <h2>1. 录制目标</h2>
  {/* 全屏/区域模式、屏幕卡片、框选区域按钮 */}
</section>

<section>
  <h2>2. 录制确认</h2>
  {/* 选区预览卡、x/y/width/height 微调、输出设置、开始录制 */}
</section>

{session.status === 'recording' && (
  <section>
    <h2>3. 录制中控制</h2>
    {/* 只显示只读状态和“返回面板”说明 */}
  </section>
)}
```

The area-preview card should render:

```tsx
{session.selectionPreviewDataUrl && session.selectionBounds && (
  <div className="rounded-2xl border border-red-500/20 bg-black/20 p-4 space-y-4">
    <img
      src={session.selectionPreviewDataUrl}
      alt="录制区域预览"
      className="w-full rounded-xl aspect-video object-cover"
    />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {(['x', 'y', 'width', 'height'] as const).map((field) => (
        <label key={field} className="space-y-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{field}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => nudgeSelection(field, -1)}>-</button>
            <input value={session.selectionBounds[field]} readOnly className="w-full text-center" />
            <button onClick={() => nudgeSelection(field, 1)}>+</button>
          </div>
        </label>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Correct the copy and lock the UI during recording**

Update the top copy and format list:

```tsx
<p className="text-muted-foreground">录制屏幕为 MP4 或 GIF 格式</p>
```

```tsx
const formatOptions = [
  { value: 'mp4', label: 'MP4', desc: '高兼容视频' },
  { value: 'gif', label: 'GIF', desc: '短片段动图' }
]
```

Disable the editable controls while `session.status === 'recording' || session.status === 'finishing'`.

- [ ] **Step 5: Run verification**

Run:

```bash
node --test src/shared/screenRecorderSession.test.cjs
npm run typecheck
```

Then run `npm run dev` and manually verify:

1. Select `区域录制`, click `框选区域`, draw a rectangle, and confirm a real preview image appears.
2. Nudge `x / y / width / height` and confirm the preview refreshes while staying on-screen.
3. Start recording and confirm the main window collapses to the mini controller.
4. Click `返回面板`, verify the main window returns without unlocking recording settings.
5. Stop recording and confirm the page restores cleanly without an “异常中断” false alarm.

Expected: all commands PASS and the manual flow matches the spec.

- [ ] **Step 6: Commit the staged recorder UI**

```bash
git add src/renderer/src/tools/ScreenRecorderTool.tsx src/renderer/src/hooks/useScreenRecorder.ts src/shared/screenRecorderSession.test.cjs
git commit -m "feat: upgrade recorder area workflow and floating controls"
```

## Self-Review

- Spec coverage:
  - 区域选区预览与微调: Task 1, Task 2, Task 4
  - 主进程单一 session 真相源: Task 2
  - preload/renderer 合同同步: Task 3
  - 小悬浮控制条与状态收口: Task 2, Task 4
  - WebM 文案清理: Task 4
- Placeholder scan:
  - No placeholder markers or deferred-work wording remain in the executable steps.
  - Each task includes explicit file paths, commands, and code snippets.
- Type consistency:
  - Shared status names stay consistent across helper, schema, preload, renderer, and main process: `idle`, `selecting-area`, `ready-to-record`, `recording`, `finishing`.
  - Shared bounds shape remains `{ x, y, width, height }` everywhere.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-screen-recorder-usability.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
