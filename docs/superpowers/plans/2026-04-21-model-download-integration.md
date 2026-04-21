# Model Download Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an onetool-native model download tool backed by a bundled Python runtime and packaged downloader script.

**Architecture:** Keep the UI in React and the orchestration in Electron main, while delegating HuggingFace and ModelScope downloads to a packaged Python runtime. The main process owns validation, process lifecycle, and log streaming.

**Tech Stack:** Electron, React, TypeScript, node:test, bundled Python runtime

---

### Task 1: Shared Model Download Contract

**Files:**
- Create: `src/shared/modelDownload.ts`
- Test: `src/shared/modelDownload.test.cjs`

- [ ] Define request, log, status, and state types for the model download feature.
- [ ] Add a small helper that normalizes default save paths and log trimming behavior.
- [ ] Cover the helper with node tests.

### Task 2: Main Service

**Files:**
- Create: `src/main/services/ModelDownloadService.ts`
- Test: `src/main/services/ModelDownloadService.test.cjs`

- [ ] Write failing tests for runtime resolution, start validation, stdout parsing, completion, and cancellation.
- [ ] Implement the service with child-process spawning and state broadcasting.
- [ ] Re-run the focused service test file until green.

### Task 3: IPC + Preload + Renderer Typings

**Files:**
- Create: `src/main/ipc/modelDownloadIpc.ts`
- Create: `src/main/ipc/modelDownloadIpc.test.cjs`
- Modify: `src/preload/createElectronBridge.ts`
- Modify: `src/preload/createElectronBridge.test.cjs`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] Add failing tests for the new IPC registration and preload bridge mappings.
- [ ] Implement IPC handlers and state push events.
- [ ] Extend preload bridge and renderer typings to expose the new API.

### Task 4: Tool Registration and UI

**Files:**
- Create: `src/renderer/src/tools/ModelDownloadTool.tsx`
- Modify: `src/renderer/src/data/tools.ts`
- Modify: `src/renderer/src/data/toolComponents.ts`
- Modify: `src/renderer/src/components/Dashboard.tsx`

- [ ] Register the new tool in the existing tool metadata.
- [ ] Build the native tool page with inputs, status, action buttons, links, and log viewer.
- [ ] Ensure the page reacts to live state updates from preload APIs.

### Task 5: App Wiring and Packaged Resources

**Files:**
- Modify: `src/main/index.ts`
- Modify: `package.json`
- Create: `resources/model-download/downloader.py`
- Add runtime directory: `resources/model-download/python/**/*`

- [ ] Wire the service and IPC registration into app startup.
- [ ] Add packaged resources to electron-builder.
- [ ] Bundle the Python runtime and downloader entry script.

### Task 6: Verification

**Files:**
- Modify as needed based on failures

- [ ] Run focused `node --test` suites for shared, service, IPC, and preload coverage.
- [ ] Run `npm run typecheck`.
- [ ] Fix any regressions and re-run verification.
