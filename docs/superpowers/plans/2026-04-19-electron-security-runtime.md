# Electron Security Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize preload-backed BrowserWindow security settings and remove the recorder indicator window's direct Node access so the app has a consistent, lower-risk Electron runtime boundary.

**Architecture:** Add one tiny `windowSecurity` helper in main, migrate target windows onto it, and update the recorder indicator HTML to rely on the existing preload bridge (`window.electron`) instead of `require('electron')`. Keep `sandbox: false` in this batch to avoid coupling the security tightening with a preload runtime rewrite.

**Tech Stack:** TypeScript, Electron main/preload, inline HTML for recorder indicator, Node `node:test`, existing build pipeline

---

## File Structure

- Create: `src/main/utils/windowSecurity.ts`
  Shared helper that returns the standard preload window `webPreferences`.
- Create: `src/main/utils/windowSecurity.test.cjs`
  Pure test for the helper output contract.
- Modify: `src/main/index.ts`
  Main window should consume the shared security helper.
- Modify: `src/main/services/ColorPickerService.ts`
  Color picker overlays should consume the shared security helper.
- Modify: `src/main/services/ScreenOverlayService.ts`
  Screen overlay windows should consume the shared security helper.
- Modify: `src/main/services/ScreenshotService.ts`
  Screenshot selection windows should consume the shared security helper.
- Modify: `src/main/services/WindowManagerService.ts`
  Float ball should consume the shared security helper.
- Modify: `src/main/services/ScreenRecorderService.ts`
  Indicator/border windows should consume the shared security helper and the indicator HTML must switch to `window.electron`.
- Modify: `src/main/services/WindowManagerService.test.cjs`
  Lock float-ball window security options.
- Modify: `src/main/services/ScreenRecorderService.test.cjs`
  Lock recorder indicator/border security options and HTML bridge usage.

### Task 1: Lock Security Contracts With Failing Tests

**Files:**
- Create: `src/main/utils/windowSecurity.test.cjs`
- Modify: `src/main/services/WindowManagerService.test.cjs`
- Modify: `src/main/services/ScreenRecorderService.test.cjs`

- [ ] **Step 1: Write the failing helper test**
- [ ] **Step 2: Add failing float-ball security assertions**
- [ ] **Step 3: Add failing recorder indicator/border security assertions**
- [ ] **Step 4: Run targeted tests and confirm failure**

Run:

```bash
node --test src/main/utils/windowSecurity.test.cjs src/main/services/WindowManagerService.test.cjs src/main/services/ScreenRecorderService.test.cjs
```

Expected:

- `windowSecurity.ts` missing
- float ball assertions fail because `contextIsolation` / `nodeIntegration` are not explicit
- recorder indicator assertions fail because the HTML still contains `require('electron')`

### Task 2: Implement Shared Security Helper

**Files:**
- Create: `src/main/utils/windowSecurity.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/services/ColorPickerService.ts`
- Modify: `src/main/services/ScreenOverlayService.ts`
- Modify: `src/main/services/ScreenshotService.ts`
- Modify: `src/main/services/WindowManagerService.ts`

- [ ] **Step 1: Implement `createIsolatedPreloadWebPreferences(preloadPath)`**
- [ ] **Step 2: Switch main window and existing preload windows to the helper**
- [ ] **Step 3: Run targeted tests and keep the suite green**

### Task 3: Remove Recorder Indicator Node Access

**Files:**
- Modify: `src/main/services/ScreenRecorderService.ts`
- Modify: `src/main/services/ScreenRecorderService.test.cjs`

- [ ] **Step 1: Update indicator and border windows to use the helper**
- [ ] **Step 2: Replace `require('electron')` in the indicator HTML with `window.electron` bridge calls**
- [ ] **Step 3: Run recorder-focused tests and verify green**

### Task 4: Verify Integration

**Files:**
- No new files

- [ ] **Step 1: Run the focused test set**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Record residual risks for the next batch**
