# Space Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-version `空间清理` tool that scans a single drive or folder, visualizes usage with a directory tree and treemap, and supports safe cleanup actions such as opening a path, copying a path, and deleting to the recycle bin.

**Architecture:** Add a dedicated main-process `SpaceCleanupService` that owns scan sessions, file-system traversal, progress reporting, and cleanup actions. Expose the service through explicit IPC and preload bridge methods, then build a standalone React tool page with a scanning control bar, summary cards, a compact tree explorer, a hand-rolled SVG treemap, and a largest-files panel.

**Tech Stack:** Electron main/preload IPC, React 18, TypeScript, Node filesystem APIs, Electron `dialog` / `shell` / `clipboard`, Node test runner (`*.test.cjs`), Tailwind UI primitives already used in the app.

---

## File Structure

**Create:**
- `D:\code\onetool\src\shared\spaceCleanup.ts`
- `D:\code\onetool\src\shared\spaceCleanup.test.cjs`
- `D:\code\onetool\src\main\services\SpaceCleanupService.ts`
- `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`
- `D:\code\onetool\src\main\ipc\spaceCleanupIpc.ts`
- `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.ts`
- `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.test.cjs`
- `D:\code\onetool\src\renderer\src\tools\SpaceCleanupTool.tsx`

**Modify:**
- `D:\code\onetool\src\shared\types.ts`
- `D:\code\onetool\src\main\index.ts`
- `D:\code\onetool\src\preload\createElectronBridge.ts`
- `D:\code\onetool\src\preload\createElectronBridge.test.cjs`
- `D:\code\onetool\src\renderer\src\types\electron.d.ts`
- `D:\code\onetool\src\renderer\src\data\tools.ts`

---

### Task 1: Define Shared Space Cleanup Models

**Files:**
- Create: `D:\code\onetool\src\shared\spaceCleanup.ts`
- Test: `D:\code\onetool\src\shared\spaceCleanup.test.cjs`
- Modify: `D:\code\onetool\src\shared\types.ts`

- [ ] **Step 1: Write the failing shared-model tests**

Cover:
- scan status ordering (`idle`, `scanning`, `completed`, `cancelled`, `failed`)
- summary counting helpers
- treemap rectangle helpers skip zero-size nodes
- largest-file trimming keeps descending order

- [ ] **Step 2: Run the shared-model tests to verify they fail**

Run: `node --test src/shared/spaceCleanup.test.cjs`
Expected: FAIL because the shared module does not exist yet.

- [ ] **Step 3: Implement the shared module and type additions**

Define:
- scan node / largest-file / summary / session types
- helper functions for summarizing nodes and trimming large-file lists
- `IpcResponse` payload aliases reused by the service and renderer

- [ ] **Step 4: Run the shared-model tests to verify they pass**

Run: `node --test src/shared/spaceCleanup.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/spaceCleanup.ts src/shared/spaceCleanup.test.cjs src/shared/types.ts
git commit -m "Add shared space cleanup models"
```

### Task 2: Add Main-Process Scan And Cleanup Service

**Files:**
- Create: `D:\code\onetool\src\main\services\SpaceCleanupService.ts`
- Test: `D:\code\onetool\src\main\services\SpaceCleanupService.test.cjs`

- [ ] **Step 1: Write the failing service tests**

Cover:
- recursive size aggregation for nested folders
- largest-file ranking and summary updates
- scan cancellation stops traversal and reports `cancelled`
- unreadable entries are skipped and counted as partial failures
- `deleteToTrash` never falls back to permanent delete
- `openPath` targets the file location, not only the raw file path

- [ ] **Step 2: Run the service tests to verify they fail**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: FAIL because the service file does not exist yet.

- [ ] **Step 3: Implement `SpaceCleanupService`**

Responsibilities:
- create and update one active scan session
- scan a root path asynchronously with batched yielding
- emit progress / complete / error events to the main window
- return a compact session snapshot for the renderer
- open paths through Explorer, copy paths to clipboard, delete to recycle bin

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `node --test src/main/services/SpaceCleanupService.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/SpaceCleanupService.ts src/main/services/SpaceCleanupService.test.cjs
git commit -m "Add space cleanup scanning service"
```

### Task 3: Expose Space Cleanup IPC And Preload Bridge

**Files:**
- Create: `D:\code\onetool\src\main\ipc\spaceCleanupIpc.ts`
- Modify: `D:\code\onetool\src\main\index.ts`
- Modify: `D:\code\onetool\src\preload\createElectronBridge.ts`
- Modify: `D:\code\onetool\src\preload\createElectronBridge.test.cjs`
- Modify: `D:\code\onetool\src\renderer\src\types\electron.d.ts`

- [ ] **Step 1: Write the failing bridge tests**

Cover:
- explicit `window.electron.spaceCleanup` methods
- progress / complete / error subscriptions
- no raw IPC surface leaked back to renderer code

- [ ] **Step 2: Run the targeted bridge tests to verify they fail**

Run: `node --test src/preload/createElectronBridge.test.cjs`
Expected: FAIL in the new `spaceCleanup` bridge expectations.

- [ ] **Step 3: Implement IPC registration and bridge surface**

Add:
- `chooseRoot`
- `startScan`
- `cancelScan`
- `getSession`
- `openPath`
- `copyPath`
- `deleteToTrash`
- `onProgress`
- `onComplete`
- `onError`

- [ ] **Step 4: Run the targeted bridge tests to verify they pass**

Run: `node --test src/preload/createElectronBridge.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/spaceCleanupIpc.ts src/main/index.ts src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs src/renderer/src/types/electron.d.ts
git commit -m "Expose space cleanup IPC bridge"
```

### Task 4: Build Renderer Hook And Tool Page

**Files:**
- Create: `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.ts`
- Create: `D:\code\onetool\src\renderer\src\hooks\useSpaceCleanup.test.cjs`
- Create: `D:\code\onetool\src\renderer\src\tools\SpaceCleanupTool.tsx`
- Modify: `D:\code\onetool\src\renderer\src\data\tools.ts`

- [ ] **Step 1: Write the failing renderer hook tests**

Cover:
- progress events update the active session
- selecting a node updates breadcrumb and detail state
- cancelled / failed scans render their states cleanly
- deleting an item triggers a refresh prompt path

- [ ] **Step 2: Run the hook tests to verify they fail**

Run: `node --test src/renderer/src/hooks/useSpaceCleanup.test.cjs`
Expected: FAIL because the hook file does not exist yet.

- [ ] **Step 3: Implement the hook and tool page**

The page should include:
- path chooser and scan controls
- scanning state with cancel button
- summary cards
- compact directory tree
- SVG treemap
- largest-file list
- item detail action bar for open / copy / delete

- [ ] **Step 4: Run the hook tests to verify they pass**

Run: `node --test src/renderer/src/hooks/useSpaceCleanup.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useSpaceCleanup.ts src/renderer/src/hooks/useSpaceCleanup.test.cjs src/renderer/src/tools/SpaceCleanupTool.tsx src/renderer/src/data/tools.ts
git commit -m "Add space cleanup tool UI"
```

### Task 5: End-To-End Verification And Preview Restart

**Files:**
- Modify: any touched files only if required by failing verification

- [ ] **Step 1: Run targeted space-cleanup suites**

Run:

```bash
node --test src/shared/spaceCleanup.test.cjs src/main/services/SpaceCleanupService.test.cjs src/preload/createElectronBridge.test.cjs src/renderer/src/hooks/useSpaceCleanup.test.cjs
```

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS with zero failing tests.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Restart preview and do a manual smoke pass**

Run:

```bash
Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'node|electron') -and $_.CommandLine -match 'D:\\code\\onetool' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 1
Start-Process -FilePath npm.cmd -ArgumentList 'run','dev' -WorkingDirectory 'D:\\code\\onetool'
```

Check:
- the new `空间清理` tool appears under `系统维护`
- choosing a folder starts a scan without freezing the app
- tree, treemap, and largest-file panels render after completion
- open / copy / delete actions work on a selected item

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add first version of the space cleanup tool"
```
