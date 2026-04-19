# Runtime Observability And Tray Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist fatal/runtime diagnostics to disk and make main-window close behavior follow the user’s tray preference instead of always hiding.

**Architecture:** Add a small pure helper for close-policy and rejection serialization, wire the settings model to a tray lifecycle API in `WindowManagerService`, and route runtime process/window failure events through the existing logger.

**Tech Stack:** TypeScript, Electron main process, Node `node:test`, existing settings and logger utilities

---

## File Structure

- Create: `src/main/utils/runtimePolicy.ts`
- Create: `src/main/utils/runtimePolicy.test.cjs`
- Modify: `src/main/services/WindowManagerService.ts`
- Modify: `src/main/services/WindowManagerService.test.cjs`
- Modify: `src/main/index.ts`
- Modify: `src/main/services/SettingsService.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/components/SettingsPage.tsx`

### Task 1: Lock Behavior With Tests

- [ ] Add pure tests for close policy and rejection serialization
- [ ] Extend tray lifecycle tests in `WindowManagerService.test.cjs`

### Task 2: Implement Main-Process Wiring

- [ ] Add `minimizeToTray` to settings defaults and shared types
- [ ] Add tray enable/disable lifecycle to `WindowManagerService`
- [ ] Wire close behavior and runtime diagnostics in `index.ts`

### Task 3: Wire Renderer Setting

- [ ] Make Settings page read/write the actual `minimizeToTray` setting

### Task 4: Verify

- [ ] Run focused tests
- [ ] Run `npm run test`
- [ ] Run `npm run build`
