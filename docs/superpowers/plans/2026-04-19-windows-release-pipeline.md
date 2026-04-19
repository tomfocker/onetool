# Windows Release Pipeline Plan

**Goal:** Add a repeatable Windows packaging and GitHub Release workflow, plus the repository metadata and documentation needed to operate it.

## Steps

1. Update `package.json`
   - Add repository metadata
   - Add `release:win`
   - Make artifact names deterministic
   - Remove explicit Windows signing disablement

2. Add GitHub Actions release workflow
   - Manual dispatch
   - `v*` tag trigger
   - Test before package
   - Upload artifacts every run
   - Draft release for tagged builds

3. Document the release path
   - Add a focused Windows release guide
   - Update README commands and release references

4. Verify locally
   - Run `npm run test`
   - Run `npm run release:win`
