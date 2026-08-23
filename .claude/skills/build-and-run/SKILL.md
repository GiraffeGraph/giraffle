---
name: build-and-run
description: Build and run the Giraffle client on macOS, an iOS simulator, an Android phone, or the browser, and produce a macOS DMG or Android APK. Use when asked to build the app, make a DMG or APK, run it on a simulator or device, reproduce a UI bug on a real screen, or check that a change works outside the test suite.
---

# Building and running Giraffle

The client is `apps/app` (Expo Router, SDK 57, RN 0.86). It has native modules —
SQLCipher, libsodium, secure storage — so **Expo Go cannot run it**. Every native
target needs a real build.

Run every command from `apps/app` unless stated otherwise.

## The one flag you must not forget

```
EXPO_NO_BUNDLE_SPLITTING=1
```

Expo cannot serialize a **split** DOM-component bundle: the generated HTML
references a shared `__common-*.js` chunk that never lands in the asset map, and
the export dies with `Asset not found`. The `export` and `export:web` scripts
already set it. Anything that bundles by another route — a raw `expo export`, a
Gradle release build — has to set it too.

## Android APK (what to hand someone)

```bash
cd apps/app
npx expo prebuild --clean --platform android
cd android
ANDROID_HOME="$HOME/Library/Android/sdk" \
ANDROID_SDK_ROOT="$HOME/Library/Android/sdk" \
EXPO_NO_BUNDLE_SPLITTING=1 \
  ./gradlew assembleRelease --no-daemon
```

Output: `apps/app/android/app/build/outputs/apk/release/app-release.apk`, roughly
126 MB, about 4 minutes on a warm machine.

- **Release is signed with the debug keystore** (the Expo template's default).
  Fine for sideloading, rejected by the Play Store. A store build needs a real
  keystore and goes through EAS.
- The JS bundle is embedded, so the APK runs with no Metro and no network.
- Three ABIs ship in one file (`arm64-v8a`, `armeabi-v7a`, `x86`), so it installs
  on anything. Splitting per ABI would roughly halve it and create a
  which-file-for-which-phone problem.
- Sourcemaps are excluded by `plugins/withoutAssetSourcemaps.js`. Do not remove
  it — Android bundling emits ~29 MB of `.map` beside the DOM bundles and Gradle
  copies the whole export directory verbatim.

Verify before handing it over:

```bash
APK=android/app/build/outputs/apk/release/app-release.apk
unzip -l "$APK" | grep -c '\.map$'                    # must be 0
unzip -l "$APK" | grep assets/index.android.bundle    # must exist
```

## macOS DMG

The desktop target is a hardened Electron shell around the encrypted Expo web
client. It has no Node access in the renderer, denies runtime permissions, and
serves the bundled app from a private secure scheme. Vault bytes remain sealed
with XChaCha20-Poly1305 in Chromium's origin-private storage.

```bash
cd apps/app
npm run desktop:dev          # export web and launch the local shell
npm run desktop:mac          # unsigned universal macOS DMG
```

Output: `apps/app/release/macos/Giraffle-<version>-macOS-universal.dmg`.
The unsigned build is for local testing and triggers Gatekeeper when copied to
another Mac. Public distribution needs a Developer ID Application certificate
and Apple notarization; once those credentials are configured, run
`npm run desktop:mac:signed`.

The desktop build uses the tiny `desktop/package.json` as its packaging root.
Do not package from `apps/app/package.json`: electron-builder then copies the
entire React Native dependency tree and turns a compact DMG into multiple GB.

## iOS simulator

```bash
cd apps/app
npx expo prebuild --clean --platform ios      # only when native deps changed
xcrun simctl list devices | grep iPhone       # pick a UDID
node ./node_modules/expo/bin/cli run:ios --device "<UDID>" --no-bundler
node ./node_modules/expo/bin/cli start --port 8081   # separate shell
```

**`simctl launch` alone gives a red `No script URL provided` screen.** The dev
client only finds Metro through its deep link:

```bash
xcrun simctl openurl "<UDID>" \
  "giraffle://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

Use that to relaunch after any change that needs a fresh start. Watch the Metro
log for runtime errors — the simulator's red box is often a stale frame while the
log has the real stack.

`prebuild --clean` matters whenever the native dependency set changes: without
it the `ios/` directory keeps its existing Pod linkage and the build links
against pods that `package.json` does not declare.

## Web

```bash
cd apps/app
npm run web            # dev server on 8081
npm run export:web     # static build into dist/
```

A reload keeps the vault open for as long as the lock timeout allows: the key
bundle is sealed under a non-extractable browser key and read back on load.
Set the timeout in Settings → App lock; "Immediately" is the way to test the
lock screen itself.

## Driving a simulator or device

The `noqa-testing` skill drives real screens. Short version:

```bash
open -a noqa                 # the CLI fails if the desktop app is closed
noqa devices ios             # list simulators
noqa devices connect <UDID>
noqa screenshot /tmp/shot.png
noqa screen                  # a11y tree with relative coords
noqa action tap   --description "the Continue button"
noqa action input --description "the Password field" --text "..."
```

Prefer `--description` over coordinates — noqa resolves the element itself.

## Checks

```bash
cd apps/app && npm run verify   # lint, typecheck, tests, native export
npm run verify                  # repo root: shared packages
npm --prefix apps/server run typecheck && npm --prefix apps/server test
```

## Things that cost hours once

- **Hermes has no WebAssembly.** Anything importing `libsodium-wrappers-sumo` at
  module scope kills the native app before it renders. That build lives in
  `packages/protocol/src/sodium-provider.ts`, deliberately outside the package
  barrel. Native uses `react-native-libsodium`. Do not re-export it from
  `packages/protocol/index.ts`.
- **Hermes has no WebCrypto.** `apps/app/index.js` installs the polyfill before
  the router loads. Without it `generateId` silently falls back to `Math.random`
  for vault and record identifiers. That entry file is why `package.json` has
  `"main": "index.js"` instead of `expo-router/entry`.
- **`react-native-libsodium` exports no `memzero`.** Zero key material with
  `bytes.fill(0)`.
- **react-native-web has no `measureInWindow` on the layout event.** Measure
  through a ref, or the screen throws on web while native looks fine.
- Green tests prove nothing about whether the app starts. Three fatal startup
  bugs shipped past a full suite. Launch it.
