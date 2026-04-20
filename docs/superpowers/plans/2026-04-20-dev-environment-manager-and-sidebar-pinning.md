# Dev Environment Manager And Sidebar Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Windows-focused development environment manager tool and add persistent sidebar pinning so frequently used tools can stay at the top.

**Architecture:** Add a dedicated main-process `DevEnvironmentService` with its own IPC surface for environment detection, install, update, and logging. On the renderer side, add a standalone tool page plus a small persistent sidebar pinning model stored in `GlobalStore`, then connect the two through the existing preload bridge and tool metadata system.

**Tech Stack:** Electron main/preload IPC, React + Zustand renderer UI, shared TypeScript models, Node test runner (`*.test.cjs`), `winget`, existing store persistence.

---

## File Structure

**Create:**
- `D:\code\onetool\src\main\services\DevEnvironmentService.ts`
- `D:\code\onetool\src\main\services\DevEnvironmentService.test.cjs`
- `D:\code\onetool\src\main\ipc\devEnvironmentIpc.ts`
- `D:\code\onetool\src\renderer\src\tools\DevEnvironmentManagerTool.tsx`
- `D:\code\onetool\src\renderer\src\tools\devEnvironmentData.ts`
- `D:\code\onetool\src\renderer\src\tools\devEnvironmentData.test.cjs`
- `D:\code\onetool\src\renderer\src\hooks\useDevEnvironmentManager.ts`
- `D:\code\onetool\src\renderer\src\hooks\useDevEnvironmentManager.test.cjs`
- `D:\code\onetool\src\shared\devEnvironment.ts`
- `D:\code\onetool\src\shared\devEnvironment.test.cjs`
- `D:\code\onetool\src\renderer\src\components\Sidebar.test.cjs`

**Modify:**
- `D:\code\onetool\src\main\services\StoreService.ts`
- `D:\code\onetool\src\main\ipc\storeIpc.ts`
- `D:\code\onetool\src\main\index.ts`
- `D:\code\onetool\src\preload\createElectronBridge.ts`
- `D:\code\onetool\src\preload\createElectronBridge.test.cjs`
- `D:\code\onetool\src\renderer\src\types\electron.d.ts`
- `D:\code\onetool\src\renderer\src\data\tools.ts`
- `D:\code\onetool\src\renderer\src\components\Sidebar.tsx`
- `D:\code\onetool\src\renderer\src\store\index.ts`
- `D:\code\onetool\src\shared\types.ts`

---

### Task 1: Define Shared Environment And Pinning Models

**Files:**
- Create: `D:\code\onetool\src\shared\devEnvironment.ts`
- Test: `D:\code\onetool\src\shared\devEnvironment.test.cjs`
- Modify: `D:\code\onetool\src\shared\types.ts`

- [ ] **Step 1: Write the failing shared-model tests**

Add tests for:
- supported environment ordering
- Java `Microsoft.OpenJDK.17` mapping
- `npm` / `pip` linked-manager semantics
- sidebar pinned tool normalization and duplicate filtering

- [ ] **Step 2: Run the shared-model tests to verify they fail**

Run: `node --test src/shared/devEnvironment.test.cjs`
Expected: FAIL because the shared environment module does not exist yet.

- [ ] **Step 3: Implement the shared environment module and type additions**

Define:
- environment IDs and display metadata
- install/update targets
- environment status enum
- helper functions for summary counts and pinned tool normalization

Extend `GlobalStore` with:
- `pinnedToolIds: string[]`

- [ ] **Step 4: Run the shared-model tests to verify they pass**

Run: `node --test src/shared/devEnvironment.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/devEnvironment.ts src/shared/devEnvironment.test.cjs src/shared/types.ts
git commit -m "Add shared dev environment and sidebar pinning models"
```

### Task 2: Add Main-Process Detection And Management Service

**Files:**
- Create: `D:\code\onetool\src\main\services\DevEnvironmentService.ts`
- Test: `D:\code\onetool\src\main\services\DevEnvironmentService.test.cjs`

- [ ] **Step 1: Write the failing service tests**

Cover:
- version parsing for `node`, `npm`, `git`, `python`, `pip`, `go`, `java`
- missing command -> `missing`
- command failure -> `broken`
- `npm` / `pip` linked status without install/update actions
- `winget` unavailable disables install/update
- update availability from `winget`
- WSL summary mapping into external status

- [ ] **Step 2: Run the service tests to verify they fail**

Run: `node --test src/main/services/DevEnvironmentService.test.cjs`
Expected: FAIL because the service file does not exist yet.

- [ ] **Step 3: Implement `DevEnvironmentService`**

Responsibilities:
- detect all environments
- detect single environment
- install/update supported environments via `winget`
- emit operation log/progress/complete events
- expose lightweight WSL summary by reusing existing WSL service or commands

Use a small command execution helper inside the service rather than coupling to `QuickInstallerService`.

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `node --test src/main/services/DevEnvironmentService.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/DevEnvironmentService.ts src/main/services/DevEnvironmentService.test.cjs
git commit -m "Add dev environment detection service"
```

### Task 3: Expose Dev Environment IPC And Preload Bridge

**Files:**
- Create: `D:\code\onetool\src\main\ipc\devEnvironmentIpc.ts`
- Modify: `D:\code\onetool\src\main\index.ts`
- Modify: `D:\code\onetool\src\preload\createElectronBridge.ts`
- Modify: `D:\code\onetool\src\preload\createElectronBridge.test.cjs`
- Modify: `D:\code\onetool\src\renderer\src\types\electron.d.ts`

- [ ] **Step 1: Write the failing preload bridge tests**

Cover:
- explicit `window.electron.devEnvironment.*` methods
- log/progress/complete subscriptions
- no raw IPC exposure

- [ ] **Step 2: Run the targeted preload tests to verify they fail**

Run: `node --test src/preload/createElectronBridge.test.cjs`
Expected: FAIL in the new `devEnvironment` bridge expectations.

- [ ] **Step 3: Implement IPC registration and bridge surface**

Add:
- `getOverview`
- `refreshAll`
- `refreshOne`
- `install`
- `update`
- `updateAll`
- `openRelatedTool`
- `onLog`
- `onProgress`
- `onComplete`

Wire the IPC registration from `src/main/index.ts`.

- [ ] **Step 4: Run the targeted preload tests to verify they pass**

Run: `node --test src/preload/createElectronBridge.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/devEnvironmentIpc.ts src/main/index.ts src/preload/createElectronBridge.ts src/preload/createElectronBridge.test.cjs src/renderer/src/types/electron.d.ts
git commit -m "Expose dev environment manager IPC bridge"
```

### Task 4: Add Persistent Sidebar Pinning Storage

**Files:**
- Modify: `D:\code\onetool\src\main\services\StoreService.ts`
- Modify: `D:\code\onetool\src\main\ipc\storeIpc.ts`
- Modify: `D:\code\onetool\src\renderer\src\store\index.ts`
- Test: `D:\code\onetool\src\shared\devEnvironment.test.cjs`

- [ ] **Step 1: Write the failing persistence tests**

Cover:
- default `pinnedToolIds` bootstrap
- store schema backfill for existing installs
- renderer store helper normalizes and persists pinned tool IDs

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npm test -- --test-name-pattern "pinned tool|store schema|normalize"`
Expected: FAIL because `pinnedToolIds` does not exist yet.

- [ ] **Step 3: Implement pinned-tool persistence**

Add:
- `pinnedToolIds` default in `StoreService`
- backfill on load
- renderer-side helper for reading/updating pinned tools through `window.electron.store`

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `npm test -- --test-name-pattern "pinned tool|store schema|normalize"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/StoreService.ts src/main/ipc/storeIpc.ts src/renderer/src/store/index.ts src/shared/devEnvironment.test.cjs
git commit -m "Persist pinned sidebar tools"
```

### Task 5: Build The Dev Environment Renderer Hook And Tool UI

**Files:**
- Create: `D:\code\onetool\src\renderer\src\hooks\useDevEnvironmentManager.ts`
- Create: `D:\code\onetool\src\renderer\src\hooks\useDevEnvironmentManager.test.cjs`
- Create: `D:\code\onetool\src\renderer\src\tools\devEnvironmentData.ts`
- Create: `D:\code\onetool\src\renderer\src\tools\devEnvironmentData.test.cjs`
- Create: `D:\code\onetool\src\renderer\src\tools\DevEnvironmentManagerTool.tsx`
- Modify: `D:\code\onetool\src\renderer\src\data\tools.ts`

- [ ] **Step 1: Write the failing renderer hook and data tests**

Cover:
- summary counts
- button visibility rules
- linked environment rendering rules for `npm` / `pip`
- WSL card action resolves to `wsl-manager`
- operation-state transitions for refresh/install/update

- [ ] **Step 2: Run the renderer hook/data tests to verify they fail**

Run: `node --test src/renderer/src/hooks/useDevEnvironmentManager.test.cjs src/renderer/src/tools/devEnvironmentData.test.cjs`
Expected: FAIL because the hook and data files do not exist yet.

- [ ] **Step 3: Implement the hook, static UI metadata, and tool page**

The page should include:
- overview summary cards
- per-environment cards
- install/update/refresh buttons
- log console
- clear log button

Use existing UI primitives from other tool pages instead of introducing a new design system.

- [ ] **Step 4: Run the renderer hook/data tests to verify they pass**

Run: `node --test src/renderer/src/hooks/useDevEnvironmentManager.test.cjs src/renderer/src/tools/devEnvironmentData.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useDevEnvironmentManager.ts src/renderer/src/hooks/useDevEnvironmentManager.test.cjs src/renderer/src/tools/devEnvironmentData.ts src/renderer/src/tools/devEnvironmentData.test.cjs src/renderer/src/tools/DevEnvironmentManagerTool.tsx src/renderer/src/data/tools.ts
git commit -m "Add dev environment manager tool UI"
```

### Task 6: Add Sidebar Pinning UX

**Files:**
- Modify: `D:\code\onetool\src\renderer\src\components\Sidebar.tsx`
- Create: `D:\code\onetool\src\renderer\src\components\Sidebar.test.cjs`
- Modify: `D:\code\onetool\src\renderer\src\store\index.ts`

- [ ] **Step 1: Write the failing sidebar tests**

Cover:
- pinned tools render in a top section above categories
- category sections exclude already pinned tools
- pin toggle persists
- pin limit and duplicate prevention
- active tool still highlights correctly inside pinned section

- [ ] **Step 2: Run the sidebar tests to verify they fail**

Run: `node --test src/renderer/src/components/Sidebar.test.cjs`
Expected: FAIL because the pinned top section does not exist yet.

- [ ] **Step 3: Implement sidebar pinning**

Add:
- a top `常用工具` section
- per-tool pin/unpin affordance
- persistence through `pinnedToolIds`
- fallback behavior when a pinned tool no longer exists in metadata

- [ ] **Step 4: Run the sidebar tests to verify they pass**

Run: `node --test src/renderer/src/components/Sidebar.test.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx src/renderer/src/components/Sidebar.test.cjs src/renderer/src/store/index.ts
git commit -m "Add persistent sidebar tool pinning"
```

### Task 7: End-To-End Verification And Cleanup

**Files:**
- Modify: any touched files only if required by failing verification

- [ ] **Step 1: Run targeted test suites**

Run:

```bash
node --test src/shared/devEnvironment.test.cjs src/main/services/DevEnvironmentService.test.cjs src/preload/createElectronBridge.test.cjs src/renderer/src/hooks/useDevEnvironmentManager.test.cjs src/renderer/src/tools/devEnvironmentData.test.cjs src/renderer/src/components/Sidebar.test.cjs
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
- the new `开发环境` tool loads
- summary and cards render
- `WSL` jumps to `WSL 管理`
- pinning a tool moves it to the top section and survives reload

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Finish dev environment manager and sidebar pinning"
```
