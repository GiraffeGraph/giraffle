# Project Memory

## Configuration
- Android APKs used for ongoing sideloaded installs must be signed with the persistent Giraffle release key at `~/.config/giraffle/android-signing/giraffle-release.p12`; never distribute the Gradle debug-signed APK, because changing signers forces uninstall and risks local data.
- The only container this repository builds is the blind sync relay (`apps/server/Dockerfile`, build context = repository root). Self-hosters build it from source via the root `docker-compose.yml`; no image is published anywhere.
- `SYNC_TOKENS` is the relay's entire access-control system. The server replaces its token table from that variable on every boot, so removing a `vaultId:token` pair revokes it at the next restart.

## Architecture
- One client: the Expo Universal app in `apps/app`, shipping iOS, Android and web from the same source, plus a sandboxed Electron shell for macOS in `apps/app/desktop`. `packages/*` is shared TypeScript consumed as source, with no build step, by the client, the relay and the root test suite.
- Pages nest: a page can contain pages, and a Board is itself a specialized page. There is no folder concept.
- The relay never holds a key. Any feature that needs to read page content has to run in the client — that includes an MCP host, whose tool contract lives in `packages/domain/src/mcp/`.
- Do not describe any device as the permanent “main device.” The first device is only the vault founder/initial trusted approver; after enrollment, all authorized devices are equal peers using the relay independently.
- Backup is not replication: `.giraffle` files are password-encrypted logical snapshots without device identity or relay history. Import is restore-only into an empty, never-synced vault; imported entities are re-emitted as fresh local sync operations.
- When removing a platform implementation, preserve reusable branding and mobile assets unless their deletion is explicitly requested.
- Treat all user vault data as production data from now on: no destructive resets or migration squashing. Schema, crypto, archive and sync changes require forward migrations, rollback/recovery planning and compatibility tests before release.
- Current foreground automatic sync is acceptable for daily use; improve Drive-like realtime/background behavior incrementally while the user actively uses the app. Do not treat `.claude/sync-backlog.md` items as blockers unless a regression risks data loss.

## Testing
- Do not boot or use an iOS simulator unless the user explicitly requests it; prefer existing physical devices or non-UI verification.
- Do not drive a physical phone with stale ADB screen coordinates. Prefer asking the user or semantic controls; if a coordinate tap is unavoidable, capture and verify a fresh screenshot immediately first, and never guess around system panels or connectivity controls.

## Product UI
- Keep product source, tests, documentation, and summaries exclusively current-state; do not preserve implementation-history inventories or compatibility terminology that can confuse future context.
- Use simple user language everywhere, including optional detail sections; show raw technical values only when they are required to use the feature.
- Do not add persistent instructional prose for direct-manipulation UI; make the interaction discoverable through the control itself and keep the screen visually quiet.
