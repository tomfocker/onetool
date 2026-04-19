# Windows Release Pipeline Design

## Goal

Give the repository a repeatable Windows release path that can produce installer artifacts locally and in GitHub Actions without pretending code signing or auto-update are already solved.

## Scope

- Add repository metadata and a dedicated Windows release script.
- Stop explicitly disabling Windows signing so certificate-based signing can be enabled through environment variables later.
- Add a GitHub Actions workflow that packages Windows artifacts on manual dispatch and on `v*` tags.
- Upload packaged artifacts and create a draft GitHub Release for tagged builds.
- Document the local and CI release path inside the repository.

## Non-Goals

- Implement auto-update runtime behavior.
- Purchase or provision a signing certificate.
- Build a full macOS/Linux release matrix.

## Design

### Packaging contract

`package.json` should expose a `release:win` script that produces both NSIS and portable Windows artifacts. Artifact names should be deterministic so CI upload rules and release docs do not depend on builder defaults.

### Signing posture

The current `win.sign: null` setting blocks future signing even if certificate secrets are present. Remove that override and let `electron-builder` decide based on environment variables. This preserves unsigned builds when no certificate exists while making the pipeline sign-capable.

### GitHub workflow

Add a dedicated `release.yml` workflow that:

1. Runs on `windows-latest`
2. Installs dependencies with normal lifecycle scripts
3. Runs the test suite before packaging
4. Produces Windows release artifacts
5. Uploads artifacts for every run
6. Publishes a draft GitHub Release only for `v*` tag pushes

Draft releases keep the pipeline safe for human review while still making the build reproducible.

### Documentation

Add a focused Windows release guide and point the README at the supported release commands and workflow trigger model.

## Risks

- Packaging can still fail if a dependency starts requiring additional native build tools.
- Unsigned builds remain a SmartScreen reputation problem until the team provisions a certificate.
- Auto-update metadata can be uploaded now, but no client-side updater should rely on it until a later batch implements updater logic.
