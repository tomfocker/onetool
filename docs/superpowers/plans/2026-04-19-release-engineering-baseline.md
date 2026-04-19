# Release Engineering Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable repository baseline for testing and building, align license metadata, and eliminate the current clear build warnings.

**Architecture:** Keep the existing test/build stack, but expose it through a standard `npm run test`, wire that into a minimal GitHub Actions workflow, align repository metadata with MIT licensing, and tighten config/import patterns that currently generate avoidable warnings.

**Tech Stack:** npm scripts, Node test runner, GitHub Actions, Electron Vite, PostCSS

---

## File Structure

- Modify: `package.json`
  Add `test` and `license` metadata.
- Modify: `postcss.config.js`
  Convert to CommonJS export.
- Modify: `src/renderer/src/App.tsx`
  Narrow lazy module globs to avoid duplicate static/dynamic imports.
- Create: `.github/workflows/ci.yml`
  Minimal repository CI.
- Create: `LICENSE`
  MIT license text.

### Task 1: Add Repository Baseline

- [ ] Add `npm run test`
- [ ] Add MIT `LICENSE` and `package.json` license metadata
- [ ] Add GitHub Actions workflow for `test` + `build`

### Task 2: Remove Build Noise

- [ ] Convert `postcss.config.js` to CommonJS
- [ ] Narrow `import.meta.glob` ranges in `App.tsx`

### Task 3: Verify

- [ ] Run `npm run test`
- [ ] Run `npm run build`
- [ ] Confirm the specific PostCSS and Vite duplicate-import warnings are gone
