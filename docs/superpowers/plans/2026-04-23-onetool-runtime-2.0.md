# OneTool Runtime 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild OneTool’s runtime skeleton so helper windows open faster, AI/OCR capabilities are shared cleanly, and main-process startup remains maintainable as the toolbox grows.

**Architecture:** Introduce a shared utility-window runtime, split capture/session responsibilities out of tool-specific services, formalize the AI platform around shared OCR/LLM services, and replace the current monolithic main bootstrap with bounded startup modules. Persisted state will gain explicit schema and migration support so runtime evolution stops depending on best-effort object merges.

**Tech Stack:** Electron, React, TypeScript, node:test, electron-vite, zod

---

### Task 1: Shared Utility Window Runtime Contract

**Files:**
- Create: `src/shared/utilityWindowRuntime.ts`
- Create: `src/shared/utilityWindowRuntime.test.cjs`
- Modify: `src/shared/llm.ts`

- [ ] **Step 1: Write the failing test**

```js
test('beginUtilityWindowSession resets stale selection state while preserving mode payload', () => {
  const {
    beginUtilityWindowSession
  } = require('./utilityWindowRuntime')

  const next = beginUtilityWindowSession({
    previous: {
      mode: 'translate',
      status: 'completed',
      overlayResults: [{ text: 'old' }]
    },
    incoming: {
      mode: 'ocr'
    }
  })

  assert.equal(next.mode, 'ocr')
  assert.equal(next.status, 'idle')
  assert.deepEqual(next.overlayResults, [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/shared/utilityWindowRuntime.test.cjs`
Expected: FAIL because `utilityWindowRuntime.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function beginUtilityWindowSession(input: {
  previous: { mode: 'ocr' | 'translate'; status: string; overlayResults: unknown[] }
  incoming: { mode: 'ocr' | 'translate' }
}) {
  return {
    mode: input.incoming.mode,
    status: 'idle',
    overlayResults: []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/shared/utilityWindowRuntime.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/utilityWindowRuntime.ts src/shared/utilityWindowRuntime.test.cjs src/shared/llm.ts
git commit -m "refactor: add utility window runtime contract"
```

### Task 2: Screen Overlay Reuse + On-Demand Capture

**Files:**
- Modify: `src/main/services/ScreenOverlayService.ts`
- Modify: `src/main/services/ScreenOverlayService.test.cjs`
- Modify: `src/renderer/src/components/ScreenOverlay.tsx`
- Modify: `src/shared/screenOverlay.ts`
- Modify: `src/shared/screenOverlay.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('start captures only the active display after the session begins', async () => {
  const service = new ScreenOverlayService()
  service.setMainWindow({})

  await service.start('translate')

  assert.deepEqual(captureRequests, [
    { displayId: 2, reason: 'session-start' }
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/ScreenOverlayService.test.cjs src/shared/screenOverlay.test.cjs`
Expected: FAIL because capture still requests all screens / old path.

- [ ] **Step 3: Write minimal implementation**

```ts
private async captureDisplay(displayId: number): Promise<void> {
  const source = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: this.resolveCaptureSize(displayId)
  })
  // map only the requested display to screenMap
}

async start(mode: ScreenOverlayMode = 'translate') {
  this.currentMode = mode
  this.sessionActive = true
  await this.prepareWindows()
  this.broadcastSessionStart()
  void this.captureDisplay(this.resolveActiveDisplayId())
  return { success: true, data: {} }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/ScreenOverlayService.test.cjs src/shared/screenOverlay.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ScreenOverlayService.ts src/main/services/ScreenOverlayService.test.cjs src/renderer/src/components/ScreenOverlay.tsx src/shared/screenOverlay.ts src/shared/screenOverlay.test.cjs
git commit -m "perf: narrow overlay capture to active display sessions"
```

### Task 3: Promote the Runtime Pattern to Color Picker and Selection Windows

**Files:**
- Modify: `src/main/services/ColorPickerService.ts`
- Modify: `src/main/services/ScreenRecorderService.ts`
- Modify: `src/main/services/ScreenshotService.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/bootstrapRoute.ts`
- Modify: `src/renderer/src/main.tsx`

- [ ] **Step 1: Write the failing test**

```js
test('color picker prepareOverlayWindow reuses an existing hidden window', async () => {
  await service.prepareOverlayWindow()
  await service.prepareOverlayWindow()

  assert.equal(createdWindows.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/ColorPickerService.test.cjs src/main/services/ScreenshotService.test.cjs src/main/services/ScreenRecorderService.test.cjs`
Expected: FAIL because these services still create ephemeral windows per session.

- [ ] **Step 3: Write minimal implementation**

```ts
private overlayWindow: BrowserWindow | null = null

async prepareOverlayWindow() {
  if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
    return this.overlayWindow
  }
  this.overlayWindow = this.createOverlayWindow()
  return this.overlayWindow
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/ColorPickerService.test.cjs src/main/services/ScreenshotService.test.cjs src/main/services/ScreenRecorderService.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ColorPickerService.ts src/main/services/ScreenRecorderService.ts src/main/services/ScreenshotService.ts src/main/index.ts src/renderer/src/bootstrapRoute.ts src/renderer/src/main.tsx
git commit -m "refactor: reuse helper windows across utility sessions"
```

### Task 4: Split Main Bootstrap by Responsibility

**Files:**
- Create: `src/main/bootstrap/registerIpc.ts`
- Create: `src/main/bootstrap/createMainWindow.ts`
- Create: `src/main/bootstrap/startBackgroundServices.ts`
- Create: `src/main/bootstrap/startWarmups.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/bootstrap/registerIpc.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('registerIpc registers screen overlay and llm handlers exactly once', () => {
  registerIpc({ mainWindowProvider: () => null })
  assert.deepEqual(registeredChannels, [
    'screen-overlay-start',
    'screen-overlay-close',
    'llm-get-config-status'
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/bootstrap/registerIpc.test.cjs`
Expected: FAIL because bootstrap modules do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function registerIpc(input: { mainWindowProvider: () => BrowserWindow | null }) {
  registerScreenOverlayIpc()
  registerTranslateIpc()
  registerLlmIpc()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/bootstrap/registerIpc.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/bootstrap/registerIpc.ts src/main/bootstrap/createMainWindow.ts src/main/bootstrap/startBackgroundServices.ts src/main/bootstrap/startWarmups.ts src/main/bootstrap/registerIpc.test.cjs src/main/index.ts
git commit -m "refactor: split main bootstrap responsibilities"
```

### Task 5: Formalize the AI Platform Layer

**Files:**
- Create: `src/main/services/llmAdapters/ScreenshotInsightAdapter.ts`
- Create: `src/main/services/llmAdapters/RenameSuggestionAdapter.ts`
- Create: `src/main/services/llmAdapters/SystemDiagnosisAdapter.ts`
- Create: `src/main/services/llmAdapters/SpaceCleanupAdapter.ts`
- Modify: `src/main/services/LlmService.ts`
- Modify: `src/main/services/LlmService.test.cjs`
- Modify: `src/main/services/TranslateService.ts`
- Modify: `src/renderer/src/components/ConfigChecker.tsx`
- Modify: `src/renderer/src/hooks/useRename.ts`
- Modify: `src/renderer/src/tools/SpaceCleanupTool.tsx`

- [ ] **Step 1: Write the failing test**

```js
test('suggestSpaceCleanup delegates prompt construction to the space cleanup adapter', async () => {
  await llmService.suggestSpaceCleanup(input)
  assert.equal(spaceCleanupAdapterCalls.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/services/LlmService.test.cjs`
Expected: FAIL because `LlmService` still owns tool-specific prompt building.

- [ ] **Step 3: Write minimal implementation**

```ts
export class SpaceCleanupAdapter {
  buildMessages(input: LlmSpaceCleanupSuggestionRequest) {
    return [{ role: 'system', content: '...' }, { role: 'user', content: JSON.stringify(input) }]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/main/services/LlmService.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/llmAdapters src/main/services/LlmService.ts src/main/services/LlmService.test.cjs src/main/services/TranslateService.ts src/renderer/src/components/ConfigChecker.tsx src/renderer/src/hooks/useRename.ts src/renderer/src/tools/SpaceCleanupTool.tsx
git commit -m "refactor: extract tool-specific llm adapters"
```

### Task 6: Settings and Store Schema Migration

**Files:**
- Create: `src/shared/settingsSchema.ts`
- Create: `src/shared/storeSchema.ts`
- Create: `src/shared/settingsSchema.test.cjs`
- Create: `src/shared/storeSchema.test.cjs`
- Modify: `src/main/services/SettingsService.ts`
- Modify: `src/main/services/StoreService.ts`
- Modify: `src/main/services/SettingsService.test.cjs`
- Modify: `src/main/services/StoreService.test.cjs`

- [ ] **Step 1: Write the failing test**

```js
test('loadSettings migrates legacy llm fields into the new nested config shape', () => {
  const next = migrateSettings({
    llmBaseUrl: 'https://example.com',
    llmModel: 'gpt-4o-mini'
  })

  assert.equal(next.ai.baseUrl, 'https://example.com')
  assert.equal(next.ai.model, 'gpt-4o-mini')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/shared/settingsSchema.test.cjs src/shared/storeSchema.test.cjs`
Expected: FAIL because schemas and migration helpers do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export const SettingsSchema = z.object({
  version: z.literal(2),
  ai: z.object({
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string()
  })
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/shared/settingsSchema.test.cjs src/shared/storeSchema.test.cjs src/main/services/SettingsService.test.cjs src/main/services/StoreService.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/settingsSchema.ts src/shared/storeSchema.ts src/shared/settingsSchema.test.cjs src/shared/storeSchema.test.cjs src/main/services/SettingsService.ts src/main/services/StoreService.ts src/main/services/SettingsService.test.cjs src/main/services/StoreService.test.cjs
git commit -m "refactor: add schema-driven settings and store migrations"
```

### Task 7: End-to-End Verification and Preview Packaging

**Files:**
- Modify as needed based on failures
- Optional docs update: `docs/distribution/windows-release.md`

- [ ] **Step 1: Run focused test suites**

Run:

```bash
node --test src/renderer/src/bootstrapRoute.test.cjs src/main/services/ScreenOverlayService.test.cjs src/main/services/OcrService.test.cjs src/main/services/LlmService.test.cjs src/preload/createElectronBridge.test.cjs src/shared/screenOverlay.test.cjs src/shared/utilityWindowRuntime.test.cjs src/shared/settingsSchema.test.cjs src/shared/storeSchema.test.cjs
```

Expected: PASS

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run test
npm run build
```

Expected: PASS

- [ ] **Step 3: Rebuild preview package**

Run:

```bash
npx electron-builder --dir --config.directories.output=release_preview --config.win.signAndEditExecutable=false
```

Expected: `release_preview/win-unpacked/onetool.exe` regenerated successfully.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: complete runtime 2.0 verification pass"
```
