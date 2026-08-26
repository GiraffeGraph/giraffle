# Giraffle release notes

## Current status

- The current version is `0.14.0`.
- macOS DMGs and the Android APK are built locally and are **unsigned**: they run on the machine that built them and trigger Gatekeeper elsewhere.
- `.github/workflows/release-macos.yml` runs on every `v*` tag. It signs and notarizes when the Apple secrets are configured; otherwise it deliberately publishes an unsigned DMG. npm publishing is skipped unless `NPM_TOKEN` is configured.
- `giraffle` has not been published to npm. Publishing the CLI waits on a signed desktop release, because `giraffle desktop install` opens the release matching the CLI version.

## Infrastructure already prepared

- Publishable npm package: `apps/cli/`
- macOS Electron packaging: `apps/app/desktop/electron-builder.yml`
- Version consistency check: `scripts/verify-release-version.mjs`
- Tag-triggered release workflow: `.github/workflows/release-macos.yml`
- Workflow responsibilities: verify, test, universal macOS build, signing, notarization, DMG checksum, GitHub Release, and npm publish with provenance.

## One-time Apple setup

Before public distribution:

1. Confirm an active Apple Developer Program membership.
2. Create/import a **Developer ID Application** certificate. The current machine only has Apple Development identities.
3. Create an App Store Connect API key for notarization.
4. Add the certificate and notarization values to GitHub Actions secrets:
   - `MAC_CERTIFICATE` — base64-encoded `.p12`
   - `MAC_CERTIFICATE_PASSWORD`
   - `KEYCHAIN_PASSWORD`
   - `APPLE_API_KEY`
   - `APPLE_API_KEY_ID`
   - `APPLE_API_ISSUER`
5. Configure npm publishing for CI (`NPM_TOKEN` if retained by the workflow, or migrate to npm trusted publishing/OIDC).

Developer ID notarization is automated malware verification, not App Store review. It usually takes minutes and requires no App Store submission.

## Release checklist

When ready to ship:

1. Choose the final version and update root, app, desktop, and CLI manifests plus the CLI version constant.
2. Run:

   ```bash
   node scripts/verify-release-version.mjs VERSION
   npm run verify
   npm --prefix apps/app run lint
   npm --prefix apps/app run typecheck
   npm --prefix apps/app test
   ```

3. Commit all release changes.
4. Create and push the matching `vVERSION` tag.
5. Let `.github/workflows/release-macos.yml` build, sign, notarize, and publish the DMG before publishing the npm CLI.
6. Verify on a clean Mac:

   ```bash
   npm install --global giraffle
   giraffle desktop install
   giraffle desktop status
   giraffle commands --json
   ```

7. Add a Homebrew Cask after the signed/notarized DMG URL and SHA-256 are stable. The Cask should install `Giraffle.app` and expose the `giraffle` CLI together.

## Distribution model

- npm installs the CLI only.
- `giraffle desktop install` explicitly opens the matching official desktop release.
- npm lifecycle scripts must not silently write to `/Applications`.
- A future Homebrew Cask can provide a one-command desktop + CLI installation.
