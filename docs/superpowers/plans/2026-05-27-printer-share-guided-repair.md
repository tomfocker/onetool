# Printer Share Guided Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn printer share repair from a diagnostic checklist into a guided repair wizard with advanced diagnostics kept available.

**Architecture:** Extend the shared troubleshooting contract with wizard step state, credential requests, and action labels. The main service still collects raw Windows facts, then normalizes them into a single recommended next step. The renderer defaults to a simple guided flow and hides detailed checks behind an advanced diagnostics disclosure.

**Tech Stack:** Electron IPC, TypeScript, React, PowerShell, Windows Credential Manager commands.

---

### Task 1: Shared Wizard Model

**Files:**
- Modify: `D:/code/onetool/src/shared/troubleshooting.ts`
- Test: `D:/code/onetool/src/main/services/TroubleshootingService.test.cjs`

- [ ] Add `PrinterShareWizardStep`, `PrinterShareGuidedAction`, `PrinterShareCredentialRequest`, and `PrinterShareCredentialResult`.
- [ ] Add `wizardStep`, `nextAction`, `advancedChecksVisibleByDefault`, `credentialState`, and `hasCredentialConflict` to printer diagnosis.
- [ ] Add credential-oriented action ids: `save-server-credential`, `clear-server-credential`, `clear-server-connection`.
- [ ] Run targeted service tests and confirm new expectations fail before implementation.

### Task 2: Backend Diagnosis and Credential Actions

**Files:**
- Modify: `D:/code/onetool/src/main/services/TroubleshootingService.ts`
- Test: `D:/code/onetool/src/main/services/TroubleshootingService.test.cjs`

- [ ] Capture `cmdkey /list` and `net use` facts for the target host without exposing passwords.
- [ ] Normalize stale sessions and saved credentials into a clear credential step.
- [ ] Implement `savePrinterShareCredential` using `cmdkey /add`, with username/password passed to the child process without app persistence.
- [ ] Implement `clear-server-credential` and `clear-server-connection` actions for the selected host only.

### Task 3: IPC and Preload Bridge

**Files:**
- Modify: `D:/code/onetool/src/main/ipc/troubleshootingIpc.ts`
- Modify: `D:/code/onetool/src/preload/createElectronBridge.ts`
- Modify: `D:/code/onetool/src/renderer/src/types/electron.d.ts`
- Test: `D:/code/onetool/src/main/ipc/troubleshootingIpc.test.cjs`
- Test: `D:/code/onetool/src/preload/createElectronBridge.test.cjs`

- [ ] Wire a `troubleshooting:printer-share-credential` IPC channel.
- [ ] Expose `savePrinterShareCredential(request)` to the renderer.
- [ ] Update tests to assert the new channel and bridge method.

### Task 4: Guided UI

**Files:**
- Modify: `D:/code/onetool/src/renderer/src/tools/TroubleshootingTool.tsx`
- Test: `D:/code/onetool/src/renderer/src/tools/TroubleshootingTool.test.cjs`

- [ ] Replace the default printer panel with service address input and one primary `开始修复` button.
- [ ] Show a single next step after diagnosis: fix client service, clear queue, enter credentials, clear old connection, apply RPC compatibility, or server-side checklist.
- [ ] Add credential inputs only when the wizard asks for them; never render saved passwords.
- [ ] Move raw check cards into an `高级诊断` disclosure that shows the current chain status.

### Task 5: Verification

**Files:**
- Test all modified modules.

- [ ] Run targeted tests for service, IPC, preload, and UI source checks.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Restart preview from `D:/code/onetool` and visually confirm the guided flow and advanced diagnostics.
