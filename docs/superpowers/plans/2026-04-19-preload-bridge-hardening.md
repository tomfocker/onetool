# Preload Bridge Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw renderer access to Electron IPC with an explicit project bridge and enable `sandbox: true` for preload-backed windows.

**Architecture:** Introduce a dedicated preload bridge factory, stop exposing toolkit `electronAPI`, migrate renderer callers to explicit bridge methods, then tighten the shared BrowserWindow helper to enable sandbox.

**Tech Stack:** TypeScript, Electron preload/main/renderer, Node `node:test`, existing build pipeline

---

## File Structure

- Create: `src/preload/createElectronBridge.ts`
  Central factory for the project-owned `window.electron` bridge.
- Create: `src/preload/createElectronBridge.test.cjs`
  Unit tests for bridge shape and channel mapping.
- Modify: `src/preload/index.ts`
  Use the bridge factory and stop exposing raw toolkit `electronAPI`.
- Modify: `src/renderer/src/types/electron.d.ts`
  Remove raw `ipcRenderer` typing and add explicit bridge APIs.
- Modify: `src/main/utils/windowSecurity.ts`
  Enable `sandbox: true`.
- Modify: renderer files that still call raw `ipcRenderer`
  Switch them to explicit bridge methods.
- Modify: `src/main/utils/windowSecurity.test.cjs`
- Modify: `src/main/services/WindowManagerService.test.cjs`
- Modify: `src/main/services/ScreenRecorderService.test.cjs`

### Task 1: Lock Failing Tests

- [ ] Add a preload bridge unit test that asserts no raw `ipcRenderer` is exposed
- [ ] Add/adjust helper tests so `sandbox: true` is required
- [ ] Update recorder HTML test so it requires the new explicit indicator-time bridge
- [ ] Run focused tests and confirm failure

### Task 2: Implement Explicit Preload Bridge

- [ ] Build `createElectronBridge`
- [ ] Replace `electronAPI` exposure in preload
- [ ] Add explicit APIs for app notifications, tool opening, audit, screenshot/recorder selections, float-ball hotkey, and auto-clicker events

### Task 3: Migrate Renderer Call Sites

- [ ] Replace remaining raw `ipcRenderer` usages in renderer and overlay hooks/components
- [ ] Remove `ipcRenderer` from renderer type declarations
- [ ] Run typecheck and focused tests

### Task 4: Enable Sandbox

- [ ] Switch shared preload window helper to `sandbox: true`
- [ ] Re-run focused tests and full build
- [ ] Record remaining maturity gaps for the next batch
