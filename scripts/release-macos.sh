#!/usr/bin/env bash
# Local macOS release: build signed app+dmg, generate updater manifest,
# create/update the GitHub release, and upload all artifacts.
#
# Usage:
#   scripts/release-macos.sh            # uses version from package.json
#   scripts/release-macos.sh v0.9.2     # explicit tag override
#
# Required env:
#   TAURI_SIGNING_PRIVATE_KEY            (path or key contents)
#   TAURI_SIGNING_PRIVATE_KEY_PASSWORD   (optional)
#   GH_TOKEN or `gh auth login`          (for upload)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VERSION_FROM_PKG="v$(node -p "require('./package.json').version")"
TAG="${1:-$VERSION_FROM_PKG}"
TAG="${TAG#v}"
TAG="v${TAG}"

echo "==> Releasing $TAG"

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  DEFAULT_KEY="$HOME/.tauri/giraffle-update.key"
  if [[ -f "$DEFAULT_KEY" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY="$DEFAULT_KEY"
    echo "==> Using signing key: $DEFAULT_KEY"
  else
    echo "ERROR: TAURI_SIGNING_PRIVATE_KEY unset and $DEFAULT_KEY missing" >&2
    exit 1
  fi
fi

echo "==> Cleaning previous bundle artifacts"
hdiutil info | awk '/^\/dev\/disk/{disk=$1} /image-path.*[Gg]iraffle|image-path.*rw\./{print disk}' | sort -u | xargs -I{} hdiutil detach {} -force 2>/dev/null || true
rm -f src-tauri/target/release/bundle/macos/rw.*.dmg
rm -f src-tauri/target/release/bundle/dmg/Giraffle_*.dmg
rm -f src-tauri/target/release/bundle/macos/Giraffle.app.tar.gz
rm -f src-tauri/target/release/bundle/macos/Giraffle.app.tar.gz.sig
rm -f src-tauri/target/release/bundle/macos/latest.json

echo "==> Building app + dmg"
CI=true npx tauri build --bundles app,dmg

echo "==> Generating updater manifest"
GIRAFFLE_RELEASE_NOTES="${GIRAFFLE_RELEASE_NOTES:-Release $TAG}" \
  node scripts/build-updater-manifest.mjs "$TAG"

DMG_PATH=$(ls -t src-tauri/target/release/bundle/dmg/Giraffle_*_aarch64.dmg | head -1)
APP_TARBALL="src-tauri/target/release/bundle/macos/Giraffle.app.tar.gz"
APP_SIG="src-tauri/target/release/bundle/macos/Giraffle.app.tar.gz.sig"
MANIFEST="src-tauri/target/release/bundle/macos/latest.json"

for f in "$DMG_PATH" "$APP_TARBALL" "$APP_SIG" "$MANIFEST"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: missing artifact $f" >&2
    exit 1
  fi
done

echo "==> Creating/locating GitHub release $TAG"
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" --title "Giraffle $TAG" --generate-notes
fi

echo "==> Uploading assets"
upload_with_retry() {
  local attempt=1
  local max=3
  while (( attempt <= max )); do
    if gh release upload "$TAG" "$@" --clobber; then
      return 0
    fi
    echo "  upload attempt $attempt failed, retrying in 5s..."
    sleep 5
    attempt=$((attempt + 1))
  done
  echo "ERROR: upload failed after $max attempts" >&2
  return 1
}

upload_with_retry \
  "$DMG_PATH" \
  "$APP_TARBALL" \
  "$APP_SIG" \
  "$MANIFEST"

echo "==> Done: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$TAG"
