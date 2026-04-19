# Hardware Model Detection Design

**Date:** 2026-04-19

**Status:** Approved for planning

## Goal

Upgrade the configuration checker so mainstream Windows desktops and laptops display a stable, user-friendly device model instead of raw BIOS placeholders, partial motherboard strings, or duplicated brand names. The feature must remain fully local and offline.

## Problem Statement

The current implementation in `SystemService.getSystemConfig()` and `ConfigChecker.tsx` has three structural issues:

1. It does not collect a dedicated whole-device model field, so users only see motherboard or component-level information.
2. Brand normalization lives in the renderer as a small ad hoc dictionary, which is too limited for mainstream OEM devices and too late in the pipeline.
3. Raw WMI/CIM values often contain placeholders such as `To Be Filled By O.E.M.` or duplicated manufacturer prefixes, and those values leak into the UI.

As a result, mainstream machines can show incomplete or low-quality labels even when Windows exposes enough information to identify them correctly.

## Objectives

- Add a dedicated device model field for whole-machine detection.
- Normalize manufacturer and model strings in the main process before they reach the renderer.
- Improve coverage for mainstream OEM and gaming PC brands commonly found on Chinese and global Windows devices.
- Preserve component visibility for motherboard, GPU, monitor, memory, disk, and OS.
- Provide deterministic fallback behavior for desktops, custom-built PCs, and poorly populated BIOS tables.

## Non-Goals

- No online hardware database integration.
- No attempt to identify every historical or niche model.
- No large full-model lookup table keyed by exact SKU.
- No redesign of the configuration checker page beyond adding the new field and updating report order.

## Current State

### Backend

`src/main/services/SystemService.ts` runs a PowerShell script that gathers CPU, motherboard, memory, GPU, disk, monitor, and OS information. Motherboard data comes from `Win32_BaseBoard`, but there is no dedicated whole-device model collection path.

### Frontend

`src/renderer/src/components/ConfigChecker.tsx` contains a local dictionary and applies string replacement during render. This works for a small set of brands but does not solve invalid placeholder filtering or consistent normalization across all hardware fields.

### Shared Contract

`src/shared/types.ts` defines `SystemConfig`, which currently lacks a field for whole-device model detection.

## Proposed Architecture

Move hardware model normalization into the main process and expose a cleaner hardware snapshot contract to the renderer.

### 1. Extend Shared Data Contract

Add `deviceModel: string` to `SystemConfig`.

This field represents the best available whole-device identity. It is separate from `motherboard` because:

- laptops and branded desktops should show their marketed machine model;
- custom-built desktops may not have a meaningful whole-device model and should fall back gracefully;
- motherboard information remains valuable for power users even when a device model exists.

### 2. Add a Hardware Normalization Module

Create a focused shared utility module for hardware naming rules. Its responsibilities:

- normalize manufacturer aliases;
- strip control characters and repeated whitespace;
- filter invalid placeholder values;
- deduplicate brand prefixes already included in the model string;
- build stable display strings for device model, motherboard, and monitors.

This module should be pure and testable in isolation.

Recommended structure:

- `src/shared/hardwareIdentity.ts`
  Contains normalization helpers and brand alias tables.
- `src/shared/hardwareIdentity.test.cjs`
  Covers placeholder filtering, alias normalization, duplicate brand removal, and fallback selection.

The exact filename may change if a better local pattern is discovered, but the responsibilities should remain isolated.

### 3. Multi-Source Device Model Detection

Use multiple Windows sources in priority order and produce one normalized `deviceModel`.

Priority:

1. `Win32_ComputerSystemProduct`
   - preferred fields: `Vendor`, `Name`, `Version`
   - best source for OEM whole-machine identity when BIOS is populated correctly
2. `Win32_ComputerSystem`
   - fallback fields: `Manufacturer`, `Model`
   - often useful on branded laptops and desktops
3. `Win32_BaseBoard`
   - fallback fields: `Manufacturer`, `Product`
   - used when the machine is custom-built or firmware exposes only board identity

Selection rule:

- accept the first candidate that survives placeholder filtering and normalization;
- if all device-level candidates are invalid, fall back to normalized motherboard information;
- if even motherboard data is invalid, return a stable generic value such as `未识别具体型号`.

### 4. Mainstream Brand Alias Coverage

Maintain a compact alias map rather than a giant exact-model database.

Initial alias coverage should include at least:

- Lenovo, ThinkPad, Legion, Xiaoxin
- ASUS, ASUSTeK, ROG
- Dell, Dell Inc., Alienware
- HP, Hewlett-Packard, HPI
- Acer
- MSI, Micro-Star
- Microsoft, Surface
- Huawei, HONOR
- Xiaomi, Redmi
- Colorful
- Thunderobot
- Mechrevo
- Machenike
- Hasee

For component vendors, preserve and expand existing coverage for:

- Intel
- AMD
- NVIDIA
- Samsung
- Kingston
- Micron
- Hynix
- Western Digital
- Seagate
- Crucial
- AOC
- Philips
- LG
- BenQ
- ViewSonic

The purpose of the alias map is normalization, not translation of every possible model family.

### 5. Placeholder and Garbage Value Filtering

Centralize a blacklist for low-quality firmware values. Initial blocked values should include exact matches or normalized variants of:

- `To Be Filled By O.E.M.`
- `System Product Name`
- `System Version`
- `Default string`
- `Not Applicable`
- `Not Available`
- `INVALID`
- `Undefined`
- empty string
- strings made only of punctuation

Filtering should be case-insensitive and whitespace-insensitive after cleanup.

### 6. Monitor Normalization

Keep the current monitor detection strategy but move name cleanup into shared normalization helpers.

Rules:

- prefer WMI monitor identity when available;
- keep Electron display resolution fallback when WMI resolution is empty or invalid;
- normalize manufacturer aliases before composing the final display name;
- avoid duplicated outputs such as `AOC AOC 24G2`;
- preserve multiple monitors as separate lines.

## Data Flow

1. Renderer requests `get-system-config`.
2. Main process gathers raw PowerShell/CIM hardware data.
3. Main process converts raw values into candidate device identity records.
4. Normalization helpers sanitize manufacturer and model values.
5. Main process resolves the best `deviceModel` and other cleaned fields.
6. Renderer receives already-normalized `SystemConfig`.
7. Renderer displays values with minimal presentation formatting only.

## UI Changes

Update `ConfigChecker.tsx` to add a new card:

- label: `设备型号`
- placement: between `处理器` and `主板`

Other UI behavior:

- keep motherboard visible even when device model is available;
- update the export report order to include `设备型号` before `处理器`;
- avoid exposing placeholder firmware strings in the UI;
- if the model cannot be recognized, show the normalized fallback result instead of raw garbage values.

## Testing Strategy

### Pure Function Tests

Add tests for:

- brand alias normalization;
- placeholder filtering;
- duplicate brand removal;
- device model candidate prioritization;
- fallback selection when OEM fields are invalid.

### Snapshot Assembly Tests

Test normalized outputs for representative raw inputs:

- branded laptop with valid `ComputerSystemProduct` values;
- branded desktop with valid `ComputerSystem.Model`;
- custom-built desktop with invalid OEM strings and valid motherboard;
- machine with duplicate manufacturer prefixes in model text;
- monitor list with valid names but missing resolution.

### Manual Verification Targets

The feature should be manually verified on or against sample outputs that represent:

- Lenovo or ThinkPad laptop
- ASUS or ROG laptop
- Dell or HP commercial laptop
- branded desktop
- custom-built desktop with motherboard-only identity
- multi-monitor setup

## Acceptance Criteria

- Mainstream OEM laptops and desktops display a whole-device model when Windows exposes it.
- Custom-built desktops fall back to motherboard identity without leaking placeholder values.
- The renderer no longer owns the main brand dictionary for hardware identity decisions.
- Exported reports include the new device model field.
- No normalized result contains blocked placeholder strings or repeated manufacturer names.
- Multi-monitor output remains readable and includes resolution when available.

## Risks and Mitigations

### Risk: BIOS tables vary widely across manufacturers

Mitigation:

- use multiple CIM classes in fixed priority order;
- centralize placeholder filtering;
- keep deterministic fallback behavior.

### Risk: Adding too many exact-model mappings becomes unmaintainable

Mitigation:

- use alias normalization and generic cleanup rules instead of a large SKU table;
- only add targeted exact mappings when a repeated mainstream failure is observed.

### Risk: Renderer and backend normalization drift apart

Mitigation:

- move normalization ownership to shared or main-process utilities;
- keep renderer formatting minimal.

## Implementation Notes

- Reuse the existing `get-system-config` IPC contract instead of adding a parallel endpoint.
- Prefer small, pure helpers over embedding more string logic directly inside the PowerShell script.
- Keep the PowerShell collection focused on data gathering; perform final selection and cleanup in TypeScript.

## Open Decisions Resolved

- Whole-device model will be displayed when detectable.
- Motherboard remains a separate visible field.
- The solution remains offline and local-only.
- The first iteration will optimize for mainstream Windows hardware rather than exhaustive SKU coverage.
