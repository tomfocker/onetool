# Auto Update Design

## Goal

Add a first production-grade Windows auto-update flow on top of GitHub Releases:

- Check for updates automatically after app startup
- Notify the user when a newer version is available
- Download the update only after explicit user confirmation
- Prompt the user to restart and install after the package is ready

This batch should integrate cleanly with the hardened Electron runtime and the new Windows release workflow without pretending code signing or multi-platform update support are already solved.

## Scope

- Windows-only update flow
- GitHub Releases as the update source
- Main-process update orchestration
- Explicit preload bridge APIs for update state and actions
- Renderer UI for update prompts and manual re-check
- A settings flag for startup auto-check

## Non-Goals

- Silent forced updates
- macOS or Linux update support
- Certificate procurement or SmartScreen reputation fixes
- Delta update optimization beyond the default updater behavior
- Background download without user confirmation

## Current State

The repository now has:

- A GitHub Actions Windows release workflow that can publish release assets
- Deterministic artifact names
- No `electron-updater` dependency
- No main-process update service
- No renderer-visible update state or settings

That means the release side has started to exist, but the app runtime still has no updater behavior at all.

## Approaches Considered

### 1. `electron-updater` with GitHub Releases

Use `electron-updater` in the main process and point it at GitHub Releases metadata and assets.

Pros:

- Matches the new release workflow directly
- Handles state transitions, download lifecycle, and install flow
- Keeps custom protocol logic out of this codebase

Cons:

- Windows signing remains an external prerequisite for the most reliable end-user experience
- The team must keep release metadata and assets consistent

### 2. Custom GitHub API polling plus browser download

Query GitHub Releases manually and send users to a download page.

Pros:

- Smaller dependency surface
- Easier to reason about initially

Cons:

- Not a real in-app updater
- No download/install lifecycle inside the app
- Adds custom release parsing logic with less value

### 3. Manual-only update checks first

Only expose a “Check for updates” button in settings.

Pros:

- Lowest behavior risk
- Simplest UI

Cons:

- Does not satisfy the selected product requirement
- Mature desktop behavior is still missing

## Chosen Approach

Use `electron-updater` with GitHub Releases, managed behind a dedicated main-process service and a minimal preload bridge.

## Architecture

### Main process

Add `src/main/services/AppUpdateService.ts`.

Responsibilities:

- Initialize `autoUpdater` with the Windows release channel
- Gate update checks behind environment and packaging rules
- Perform delayed startup auto-checks
- Translate updater events into a stable internal state model
- Download an available update after user confirmation
- Trigger `quitAndInstall()` only after download completion
- Log failures through the existing main-process logger

The service should be the only place that touches `electron-updater`.

### Shared state model

Add a small shared update contract under `src/shared/`, for example:

- `UpdateState`
- `UpdateStatus`
- `UpdateAvailability`

The model should describe:

- `idle`
- `checking`
- `available`
- `not-available`
- `downloading`
- `downloaded`
- `error`

It should also carry only the renderer-safe details:

- current version
- latest version
- release notes summary if available
- progress percentage if downloading
- user-facing error message when present

### IPC and preload

Extend the existing preload bridge with explicit updater APIs:

- `updates.getState()`
- `updates.checkForUpdates()`
- `updates.downloadUpdate()`
- `updates.quitAndInstall()`
- `updates.onStateChanged(callback)`

No raw updater object or generic event bus should be exposed.

### Renderer

Add one focused update coordinator in the renderer, likely a hook plus a lightweight presentation component.

Responsibilities:

- Read current updater state on mount
- Subscribe to state changes
- Show a passive notification when a new version is found
- Ask for confirmation before download
- Show download progress
- Show a restart prompt after the update is ready
- Expose a settings-level “Check for updates now” action

The first batch should keep this UI restrained. A toast plus a modal or inline settings panel is enough.

## Startup Flow

1. App boots normally.
2. Main process creates `AppUpdateService`.
3. Service decides whether updates are allowed in the current runtime.
4. If auto-check is enabled and the app is packaged, the service waits a short delay after startup and runs `checkForUpdates()`.
5. Renderer receives `checking`, then one of:
   - `not-available`
   - `available`
   - `error`
6. If `available`, the renderer prompts the user to download.
7. If the user confirms, renderer calls `downloadUpdate()`.
8. After download finishes, renderer prompts for restart.
9. If the user confirms, renderer calls `quitAndInstall()`.

## Environment and Safety Rules

The service should refuse automatic update behavior when any of these are true:

- The app is running in development
- The app is unpackaged
- Required updater metadata is missing

In those cases, the updater should stay in a safe `idle` state or return a structured failure, rather than pretending an update check ran successfully.

## Settings

Extend app settings with:

- `autoCheckForUpdates: boolean`

Default:

- `true`

Renderer settings UI should expose:

- A toggle for startup auto-check
- A button for manual update checks
- A compact status line showing current version and latest known update state

## Error Handling

The updater must distinguish between:

- no update available
- update service unavailable
- download failed
- install deferred by user

The main process should log the underlying cause, while the renderer should present a simpler user-facing message.

Examples:

- “当前已是最新版本”
- “检查更新失败，请稍后重试”
- “更新下载失败，请稍后重试”
- “更新已下载，重启后安装”

## Release Contract

This design assumes the Windows release workflow continues to publish:

- installer `.exe`
- portable `.exe`
- `latest.yml`
- related blockmap files

The packaged app should also carry explicit GitHub publish metadata for the updater, rather than relying on inference. The implementation batch should add a Windows/GitHub publish contract that includes:

- provider: `github`
- owner: `tomfocker`
- repo: `onetool`

Only published GitHub Releases should be considered visible to the runtime updater. Draft Releases remain part of the human review path and should not be treated as update candidates.

The updater runtime should consume only the release metadata and installer artifacts it needs. The portable build remains useful for manual distribution but should not complicate the runtime update state machine.

## Testing Strategy

### Main-process unit tests

Add tests for:

- startup check gating in dev vs packaged mode
- state transitions from checking to available/not-available/error
- refusing download before an available update exists
- refusing install before a downloaded update exists

Use an injected updater adapter instead of hitting the real network.

### Preload tests

Add bridge tests for:

- explicit updater methods mapping to the right IPC channels
- update-state subscription and unsubscribe behavior

### Renderer tests

Add tests for:

- prompting only when update state becomes `available`
- showing progress when state becomes `downloading`
- prompting restart when state becomes `downloaded`
- honoring the startup auto-check toggle state in settings

## Risks

- Unsigned Windows builds may still produce a poor trust experience even if updater logic works.
- GitHub Release asset mismatches can break update discovery if release metadata and uploaded artifacts drift apart.
- Update UX can become noisy if startup checks run too early or too often.

## Recommended Next Step

After this spec is approved, write an implementation plan for:

1. shared updater contract
2. main-process update service
3. preload IPC bridge
4. renderer update UI and settings integration
5. release workflow compatibility verification
