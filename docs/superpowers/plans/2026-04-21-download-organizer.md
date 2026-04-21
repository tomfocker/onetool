# Download Organizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a download organizer tool with combined rules, manual preview/apply, and background folder watching for new downloads.

**Architecture:** Put rule evaluation and path templating in a shared module so both tests and the main-process service use the same behavior. Keep folder watching and file moves in a dedicated main-process service, expose it through preload IPC, and mount a standalone renderer tool page for configuration and preview results.

**Tech Stack:** Electron, React, TypeScript, node:test, IPC bridge, existing global store persistence

---

### Task 1: Shared Rule Model And Utilities

**Files:**
- Create: `src/shared/downloadOrganizer.ts`
- Create: `src/shared/downloadOrganizer.test.cjs`
- Modify: `src/shared/types.ts`

- [ ] Define the shared types for config, rules, preview items, activity logs, and state.
- [ ] Write failing tests for category detection, rule matching, destination templating, and rename conflict resolution.
- [ ] Implement the minimal shared helpers to pass those tests.

### Task 2: Main-Process Service

**Files:**
- Create: `src/main/services/DownloadOrganizerService.ts`
- Create: `src/main/services/DownloadOrganizerService.test.cjs`
- Modify: `src/main/services/StoreService.ts`
- Modify: `src/main/index.ts`

- [ ] Write failing service tests for preview scanning, apply-preview moves, temporary download filtering, and watcher restart behavior.
- [ ] Implement the download organizer service with persisted config/state, watcher lifecycle, preview generation, and apply execution.
- [ ] Wire service startup into the main process and keep watcher state aligned with stored config.

### Task 3: IPC And Preload Bridge

**Files:**
- Create: `src/main/ipc/downloadOrganizerIpc.ts`
- Modify: `src/preload/createElectronBridge.ts`
- Modify: `src/main/index.ts`

- [ ] Write or extend a focused IPC test if needed for state forwarding.
- [ ] Add download organizer IPC handlers for state retrieval, config updates, preview, apply, toggling watch, and directory picking.
- [ ] Expose the API on `window.electron`.

### Task 4: Renderer Tool

**Files:**
- Create: `src/renderer/src/tools/DownloadOrganizerTool.tsx`
- Modify: `src/renderer/src/data/tools.ts`

- [ ] Build the tool page with monitoring controls, path selectors, rule editor, preview list, and activity feed.
- [ ] Subscribe to pushed state changes so the UI stays in sync with background watcher activity.
- [ ] Keep the UI self-contained and consistent with existing tools.

### Task 5: Verification

**Files:**
- Verify only

- [ ] Run targeted tests for the shared module and service.
- [ ] Run the full `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Report actual results and any residual risks.
