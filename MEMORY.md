# Project Memory

## Configuration
- Android APKs used for ongoing sideloaded installs must be signed with the persistent Giraffle release key at `~/.config/giraffle/android-signing/giraffle-release.p12`; never distribute the Gradle debug-signed APK, because changing signers forces uninstall and risks local data.
- The only container this repository builds is the blind sync relay (`apps/server/Dockerfile`, build context = repository root). Self-hosters build it from source via the root `docker-compose.yml`; no image is published anywhere.
- `SYNC_TOKENS` is the relay's entire access-control system. The server replaces its token table from that variable on every boot, so removing a `vaultId:token` pair revokes it at the next restart.

## Architecture
- Giraffle is permanently an opinionated personal knowledge and planning application built first for its sole primary user; open source enables inspection and forking, not team collaboration, multi-user project management, enterprise workflows, or broad-market compromise.
- One client: the Expo Universal app in `apps/app`, shipping iOS, Android and web from the same source, plus a sandboxed Electron shell for macOS in `apps/app/desktop`. `packages/*` is shared TypeScript consumed as source, with no build step, by the client, the relay and the root test suite.
- One recursive Page is the only canonical knowledge/planning entity. Pages contain direct child pages; planning meaning comes from custom state, and category/priority/calendar are reusable lenses over children rather than separate entities.
- Page states are vault-customizable definitions mapped to the stable `forever`, `open`, or `done` families. Archive is an independent visibility lifecycle, not a state family. A captured open page starts in Inbox and moves to its real single parent when organized.
- Categories belong to one parent page (or the workspace root). Moving a page to another parent clears its category while preserving state, priority, schedule, document, and descendants. Child views never flatten descendants.
- The relay never holds a key. Headless automation is another adapter over the same canonical vault/repository used by the UI; never create a separate CLI vault or parallel persistence model. CLI writes must appear in the UI and UI writes in the CLI.
- Public CLI/desktop distribution is deferred while the product is changing. Before publishing, follow `docs/releasing.md`; the npm CLI version must have a matching signed/notarized desktop GitHub release.
- Do not describe any device as the permanent “main device.” The first device is only the vault founder/initial trusted approver; after enrollment, all authorized devices are equal peers using the relay independently.
- Backup is not replication: `.giraffle` files are password-encrypted logical snapshots without device identity or relay history. Import is restore-only into an empty, never-synced vault; imported entities are re-emitted as fresh local sync operations.
- When removing a platform implementation, preserve reusable branding and mobile assets unless their deletion is explicitly requested.
- Before the first public vault-format release, keep only the canonical current schema and no hypothetical backward-compatibility layer. When installing a schema-squashed pre-release build, clear incompatible local app data if the user has confirmed no vault must survive; never claim it was preserved. After release, treat vault data as production data and require forward schema evolution plus recovery planning.
- Current foreground automatic sync is acceptable for daily use; improve Drive-like realtime/background behavior incrementally while the user actively uses the app. Do not treat `.claude/sync-backlog.md` items as blockers unless a regression risks data loss.

## Testing
- Do not boot or use an iOS simulator unless the user explicitly requests it; prefer existing physical devices or non-UI verification.
- Do not drive a physical phone with stale ADB screen coordinates. Prefer asking the user or semantic controls; if a coordinate tap is unavoidable, capture and verify a fresh screenshot immediately first, and never guess around system panels or connectivity controls.

## Product UI
- Keep product source, tests, documentation, and summaries exclusively current-state; do not preserve implementation-history inventories or compatibility terminology that can confuse future context.
- Use simple user language everywhere, including optional detail sections; show raw technical values only when they are required to use the feature.
- Do not add persistent instructional prose for direct-manipulation UI; make the interaction discoverable through the control itself and keep the screen visually quiet.
