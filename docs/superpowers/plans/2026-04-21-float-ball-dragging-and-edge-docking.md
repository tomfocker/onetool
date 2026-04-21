# Float Ball Dragging And Edge Docking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the float ball drag smoothly, dock to the nearest left or right edge with a half-hidden resting state, and keep the visible/interactive area aligned with the circular ball while preserving CPU and MEM status rendering.

**Architecture:** Move drag positioning and docking decisions into `WindowManagerService`, keep IPC as a narrow command surface, and let `FileDropover` become a renderer state machine that reacts to dock layout updates rather than manually driving window position every pointer frame. Treat CPU and MEM arcs as stable status UI, not hover decoration, and constrain hover/click behavior to the circular handle only.

**Tech Stack:** Electron main/preload/renderer, TypeScript, node:test, existing float ball IPC bridge, existing `WindowManagerService` and `FileDropover` component tests

---

## File Map

- Modify: `src/main/services/WindowManagerService.ts`
  Responsibility: own float ball drag session state, display-aware docking math, half-hidden bounds, peek bounds, and restore-on-expand behavior.
- Modify: `src/main/services/WindowManagerService.test.cjs`
  Responsibility: verify dock-side math, docking after drag end, and restoring from peek/docked state without a real Electron window.
- Modify: `src/main/ipc/floatBallIpc.ts`
  Responsibility: replace generic high-frequency `setPosition` use with explicit drag/dock IPC commands that delegate to `WindowManagerService`.
- Modify: `src/preload/createElectronBridge.ts`
  Responsibility: expose the new float ball drag lifecycle and dock layout APIs to the renderer.
- Modify: `src/preload/createElectronBridge.test.cjs`
  Responsibility: prove the bridge maps the new float ball methods to the intended IPC channels.
- Modify: `src/renderer/src/components/FileDropover.tsx`
  Responsibility: shrink the active hit area to the circular handle, switch drag behavior to the new IPC lifecycle, render dock/peek/dragging states, and keep CPU/MEM visuals stable.
- Modify: `src/renderer/src/components/FileDropover.test.cjs`
  Responsibility: lock in CPU/MEM status semantics, circle-only interaction classes, and docked/peek renderer state hooks.

### Task 1: Main-Process Docking State And Geometry

**Files:**
- Modify: `src/main/services/WindowManagerService.ts`
- Modify: `src/main/services/WindowManagerService.test.cjs`

- [ ] **Step 1: Write the failing docking math test**

```js
test('finishFloatBallDrag docks to the nearest right edge and keeps the ball half visible', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  const floatBallWindow = browserWindowInstances[0]
  floatBallWindow.setBounds({ x: 1760, y: 220, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  service.dragFloatBallTo({ screenX: 1860, screenY: 260 })
  const result = service.endFloatBallDrag()

  assert.equal(result.success, true)
  assert.equal(result.data.dockSide, 'right')
  assert.equal(result.data.dockState, 'docked')
  assert.equal(result.data.bounds.x, 1920 - result.data.visibleWidth)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "finishFloatBallDrag docks to the nearest right edge and keeps the ball half visible"`
Expected: FAIL with `service.beginFloatBallDrag is not a function` or equivalent missing-method failure.

- [ ] **Step 3: Write the minimal docking implementation**

```ts
type FloatBallDockSide = 'left' | 'right' | null
type FloatBallDockState = 'free' | 'dragging' | 'preview' | 'docked' | 'peek' | 'expanded'

type FloatBallLayoutState = {
  bounds: { x: number; y: number; width: number; height: number }
  dockSide: FloatBallDockSide
  dockState: FloatBallDockState
  visibleWidth: number
}

private floatBallLayoutState: FloatBallLayoutState | null = null
private floatBallDragSession: { pointerOffsetX: number; pointerOffsetY: number } | null = null
private readonly floatBallBounds = { width: 120, height: 120 }
private readonly floatBallVisibleWidth = 54
private readonly floatBallPeekInset = 18
private readonly floatBallEdgeThreshold = 56

beginFloatBallDrag(input: { pointerOffsetX: number; pointerOffsetY: number }): IpcResponse<FloatBallLayoutState> {
  if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
    return { success: false, error: '悬浮球窗口不存在' }
  }

  this.floatBallDragSession = input
  const bounds = this.floatBallWindow.getBounds()
  this.floatBallLayoutState = {
    bounds,
    dockSide: null,
    dockState: 'dragging',
    visibleWidth: this.floatBallVisibleWidth
  }
  return { success: true, data: this.floatBallLayoutState }
}

private resolveDockedBounds(bounds: { x: number; y: number; width: number; height: number }) {
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea
  const midpoint = workArea.x + workArea.width / 2
  const dockSide: FloatBallDockSide = bounds.x + bounds.width / 2 >= midpoint ? 'right' : 'left'
  const clampedY = Math.min(Math.max(bounds.y, workArea.y + 16), workArea.y + workArea.height - bounds.height - 16)
  const x = dockSide === 'right'
    ? workArea.x + workArea.width - this.floatBallVisibleWidth
    : workArea.x - (bounds.width - this.floatBallVisibleWidth)

  return {
    dockSide,
    bounds: { x: Math.round(x), y: Math.round(clampedY), width: bounds.width, height: bounds.height }
  }
}

endFloatBallDrag(): IpcResponse<FloatBallLayoutState> {
  if (!this.floatBallWindow || this.floatBallWindow.isDestroyed()) {
    return { success: false, error: '悬浮球窗口不存在' }
  }

  const docked = this.resolveDockedBounds(this.floatBallWindow.getBounds())
  this.floatBallWindow.setBounds(docked.bounds)
  this.floatBallDragSession = null
  this.floatBallLayoutState = {
    bounds: docked.bounds,
    dockSide: docked.dockSide,
    dockState: 'docked',
    visibleWidth: this.floatBallVisibleWidth
  }
  return { success: true, data: this.floatBallLayoutState }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "finishFloatBallDrag docks to the nearest right edge and keeps the ball half visible|createFloatBallWindow creates a focusable float ball window for native drag and drop"`
Expected: PASS and confirm the existing window-creation assertions still hold.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/WindowManagerService.ts src/main/services/WindowManagerService.test.cjs
git commit -m "feat: add float ball docking state"
```

### Task 2: IPC And Preload Bridge For Drag Lifecycle

**Files:**
- Modify: `src/main/ipc/floatBallIpc.ts`
- Modify: `src/preload/createElectronBridge.ts`
- Modify: `src/preload/createElectronBridge.test.cjs`

- [ ] **Step 1: Write the failing bridge test**

```js
test('createElectronBridge exposes explicit float ball drag lifecycle APIs', () => {
  const sent = []
  const invoked = []
  const bridge = createElectronBridge({
    ipcRenderer: {
      send(channel, payload) { sent.push([channel, payload]) },
      invoke(channel, payload) { invoked.push([channel, payload]); return Promise.resolve({ success: true }) },
      on() {},
      removeListener() {}
    },
    webUtils: { getPathForFile: () => 'C:\\\\temp\\\\a.txt' }
  })

  bridge.floatBall.beginDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  bridge.floatBall.dragTo({ screenX: 1400, screenY: 320 })
  bridge.floatBall.endDrag()
  bridge.floatBall.peek()
  bridge.floatBall.restoreDock()

  assert.deepEqual(sent[0], ['floatball-begin-drag', { pointerOffsetX: 36, pointerOffsetY: 36 }])
  assert.deepEqual(sent[1], ['floatball-drag-to', { screenX: 1400, screenY: 320 }])
  assert.deepEqual(invoked[0], ['floatball-end-drag', undefined])
  assert.deepEqual(invoked[1], ['floatball-peek', undefined])
  assert.deepEqual(invoked[2], ['floatball-restore-dock', undefined])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "createElectronBridge exposes explicit float ball drag lifecycle APIs"`
Expected: FAIL because the bridge does not yet define `beginDrag`, `dragTo`, `endDrag`, `peek`, or `restoreDock`.

- [ ] **Step 3: Write the minimal IPC and preload implementation**

```ts
ipcMain.on('floatball-begin-drag', (_event, payload) => {
  windowManagerService.beginFloatBallDrag(payload)
})

ipcMain.on('floatball-drag-to', (_event, payload) => {
  windowManagerService.dragFloatBallTo(payload)
})

ipcMain.handle('floatball-end-drag', () => {
  return windowManagerService.endFloatBallDrag()
})

ipcMain.handle('floatball-peek', () => {
  return windowManagerService.peekFloatBall()
})

ipcMain.handle('floatball-restore-dock', () => {
  return windowManagerService.restoreFloatBallDock()
})
```

```ts
const floatBallAPI = {
  beginDrag: (payload: { pointerOffsetX: number; pointerOffsetY: number }) => ipcRenderer.send('floatball-begin-drag', payload),
  dragTo: (payload: { screenX: number; screenY: number }) => ipcRenderer.send('floatball-drag-to', payload),
  endDrag: () => ipcRenderer.invoke('floatball-end-drag'),
  peek: () => ipcRenderer.invoke('floatball-peek'),
  restoreDock: () => ipcRenderer.invoke('floatball-restore-dock'),
  getState: () => ipcRenderer.invoke('floatball-get-state'),
  onVisibilityChanged: (callback: (visible: boolean) => void) => onChannel('floatball-visibility-changed', callback)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "createElectronBridge exposes explicit float ball drag lifecycle APIs|createElectronBridge subscriptions route through explicit channels and unsubscribe cleanly"`
Expected: PASS and no regression in the existing preload bridge behavior.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/floatBallIpc.ts src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs
git commit -m "feat: expose float ball drag lifecycle bridge"
```

### Task 3: Renderer Docked/Peek State And Circle-Only Interaction

**Files:**
- Modify: `src/renderer/src/components/FileDropover.tsx`
- Modify: `src/renderer/src/components/FileDropover.test.cjs`

- [ ] **Step 1: Write the failing renderer test**

```js
test('FileDropover keeps CPU and MEM status arcs while using docked and peek state classes', () => {
  const filePath = path.join(__dirname, 'FileDropover.tsx')
  const source = fs.readFileSync(filePath, 'utf8')

  assert.match(source, /dockState/)
  assert.match(source, /docked-left/)
  assert.match(source, /docked-right/)
  assert.match(source, /peek/)
  assert.match(source, /beginDrag\(\{ pointerOffsetX:/)
  assert.match(source, /dragTo\(\{ screenX:/)
  assert.match(source, /endDrag\(\)/)
  assert.match(source, /CPU/)
  assert.match(source, /MEM/)
  assert.doesNotMatch(source, /floatBall\.setPosition\(/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "FileDropover keeps CPU and MEM status arcs while using docked and peek state classes"`
Expected: FAIL because `FileDropover.tsx` still references `floatBall.setPosition(...)` and has no dock-state classes.

- [ ] **Step 3: Write the minimal renderer implementation**

```tsx
const [dockState, setDockState] = useState<'free' | 'dragging' | 'docked-left' | 'docked-right' | 'peek' | 'expanded'>('free')
const [dockSide, setDockSide] = useState<'left' | 'right' | null>(null)

const handlePointerDown = (e: React.PointerEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.drag-handle')) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  window.electron.floatBall.beginDrag({
    pointerOffsetX: e.clientX - rect.left,
    pointerOffsetY: e.clientY - rect.top
  })
  setDockState('dragging')
}

const handlePointerMove = (e: React.PointerEvent) => {
  if (!isDraggingRef.current) return
  window.electron.floatBall.dragTo({ screenX: e.screenX, screenY: e.screenY })
}

const handlePointerUp = async () => {
  if (!isDraggingRef.current) return
  const result = await window.electron.floatBall.endDrag()
  if (result.success && result.data) {
    setDockSide(result.data.dockSide)
    setDockState(result.data.dockSide === 'left' ? 'docked-left' : 'docked-right')
  }
}
```

```tsx
<div
  className={cn(
    'relative h-full w-full select-none',
    dockState === 'dragging' && 'cursor-grabbing',
    dockState === 'docked-left' && 'is-docked-left',
    dockState === 'docked-right' && 'is-docked-right',
    dockState === 'peek' && 'is-peek'
  )}
>
  <button
    type="button"
    className="peer/trigger group/trigger drag-handle relative flex h-[72px] w-[72px] items-center justify-center rounded-full"
  >
    {/* CPU outer arc and MEM inner arc remain intact */}
  </button>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --test-name-pattern "FileDropover keeps CPU and MEM status arcs while using docked and peek state classes|FileDropover renders animated status shell with realtime stats"`
Expected: PASS and the component no longer depends on `floatBall.setPosition(...)`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/FileDropover.tsx src/renderer/src/components/FileDropover.test.cjs
git commit -m "feat: add docked float ball renderer states"
```

### Task 4: Peek, Restore, And End-To-End Regression Verification

**Files:**
- Modify: `src/main/services/WindowManagerService.ts`
- Modify: `src/main/services/WindowManagerService.test.cjs`
- Modify: `src/renderer/src/components/FileDropover.tsx`
- Modify: `src/renderer/src/components/FileDropover.test.cjs`

- [ ] **Step 1: Write the failing peek/restore test**

```js
test('restoreFloatBallDock returns the expanded float ball to its last docked side after hover-out', () => {
  const { WindowManagerService, browserWindowInstances } = loadWindowManagerServiceModule()
  const service = new WindowManagerService()

  service.createFloatBallWindow()
  browserWindowInstances[0].setBounds({ x: 1866, y: 240, width: 120, height: 120 })

  service.beginFloatBallDrag({ pointerOffsetX: 36, pointerOffsetY: 36 })
  service.dragFloatBallTo({ screenX: 1880, screenY: 280 })
  service.endFloatBallDrag()
  service.peekFloatBall()

  const result = service.restoreFloatBallDock()

  assert.equal(result.success, true)
  assert.equal(result.data.dockState, 'docked')
  assert.equal(result.data.dockSide, 'right')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern "restoreFloatBallDock returns the expanded float ball to its last docked side after hover-out"`
Expected: FAIL because `peekFloatBall` and `restoreFloatBallDock` are not implemented yet.

- [ ] **Step 3: Write the minimal peek/restore implementation**

```ts
peekFloatBall(): IpcResponse<FloatBallLayoutState> {
  if (!this.floatBallWindow || !this.floatBallLayoutState?.dockSide) {
    return { success: false, error: '悬浮球未停靠' }
  }

  const display = screen.getDisplayMatching(this.floatBallLayoutState.bounds)
  const workArea = display.workArea
  const x = this.floatBallLayoutState.dockSide === 'right'
    ? workArea.x + workArea.width - this.floatBallBounds.width + this.floatBallPeekInset
    : workArea.x - this.floatBallPeekInset

  const bounds = { ...this.floatBallLayoutState.bounds, x: Math.round(x) }
  this.floatBallWindow.setBounds(bounds)
  this.floatBallLayoutState = { ...this.floatBallLayoutState, bounds, dockState: 'peek' }
  return { success: true, data: this.floatBallLayoutState }
}

restoreFloatBallDock(): IpcResponse<FloatBallLayoutState> {
  if (!this.floatBallWindow || !this.floatBallLayoutState?.dockSide) {
    return { success: false, error: '悬浮球未停靠' }
  }

  const docked = this.resolveDockedBounds(this.floatBallLayoutState.bounds)
  this.floatBallWindow.setBounds(docked.bounds)
  this.floatBallLayoutState = {
    ...this.floatBallLayoutState,
    bounds: docked.bounds,
    dockState: 'docked',
    dockSide: docked.dockSide
  }
  return { success: true, data: this.floatBallLayoutState }
}
```

```tsx
const handleMouseEnter = async () => {
  if (dockState === 'docked-left' || dockState === 'docked-right') {
    const result = await window.electron.floatBall.peek()
    if (result.success) {
      setDockState('peek')
    }
  }
}

const handleMouseLeave = async () => {
  if (!isExpanded && dockState === 'peek') {
    const result = await window.electron.floatBall.restoreDock()
    if (result.success && result.data?.dockSide) {
      setDockState(result.data.dockSide === 'left' ? 'docked-left' : 'docked-right')
    }
  }
}
```

- [ ] **Step 4: Run the regression suite**

Run: `npm test -- --test-name-pattern "createElectronBridge exposes explicit float ball drag lifecycle APIs|finishFloatBallDrag docks to the nearest right edge and keeps the ball half visible|restoreFloatBallDock returns the expanded float ball to its last docked side after hover-out|FileDropover keeps CPU and MEM status arcs while using docked and peek state classes|FileDropover renders animated status shell with realtime stats"`
Expected: PASS for all float ball drag/dock coverage.

Run: `npm run typecheck:web`
Expected: PASS with no renderer type errors.

Run: `npm run typecheck:node`
Expected: PASS with no main-process type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/WindowManagerService.ts src/main/services/WindowManagerService.test.cjs src/main/ipc/floatBallIpc.ts src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs src/renderer/src/components/FileDropover.tsx src/renderer/src/components/FileDropover.test.cjs
git commit -m "feat: add float ball edge docking behavior"
```
