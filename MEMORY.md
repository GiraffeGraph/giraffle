# Project Memory

## Configuration
- After every completed implementation batch, rebuild the unsigned universal macOS app with `npm --prefix apps/app run desktop:dir` and replace `/Applications/Giraffle.app` with `apps/app/release/macos/mac-universal/Giraffle.app`; tests or JS exports alone do not count as delivery. Never launch, reopen, click through, screen-capture, or remotely debug the installed app unless the user explicitly requests it.
- Android APKs used for ongoing sideloaded installs must be signed with the persistent Giraffle release key at `~/.config/giraffle/android-signing/giraffle-release.p12`; never distribute the Gradle debug-signed APK, because changing signers forces uninstall and risks local data.
- The only container this repository builds is the blind sync relay (`apps/server/Dockerfile`, build context = repository root). Self-hosters build it from source via the root `docker-compose.yml`; no image is published anywhere.
- `SYNC_TOKENS` is the relay's entire access-control system. The server replaces its token table from that variable on every boot, so removing a `vaultId:token` pair revokes it at the next restart.

## Architecture
- Giraffle is permanently an opinionated personal knowledge and planning application exclusively for its sole primary user; open source enables inspection and forking, not team collaboration, multi-user project management, enterprise workflows, or broad-market compromise.
- External integrations, including Google Calendar, connect only the primary user's own personal accounts. Keep one device-local grant and one personal primary calendar; never add multi-user OAuth, account switching, team administration, or public SaaS verification infrastructure unless explicitly requested.
- For self-hosted personal integrations, import provider credentials device-locally through the native host rather than baking them into source or builds. Google Desktop OAuth JSON is selected in Settings, parsed only by Electron main, and encrypted with macOS `safeStorage`; its client secret must never enter the renderer, repository, vault, or build.
- One client: the Expo Universal app in `apps/app`, shipping iOS, Android and web from the same source, plus a sandboxed Electron shell for macOS in `apps/app/desktop`. `packages/*` is shared TypeScript consumed as source, with no build step, by the client, the relay and the root test suite.
- Features described as app integrations must cover iOS, Android and macOS unless the user explicitly limits the platform. Platform-specific OAuth credentials are acceptable implementation details, not a reason to silently ship a desktop-only feature.
- One recursive Page is the only canonical knowledge/planning entity. Pages contain direct child pages; planning meaning comes from custom state, and category/priority/calendar are reusable lenses over children rather than separate entities.
- A recurring calendar series must have one canonical Page with virtual calendar occurrences; never import or expose every occurrence as a separate Inbox Page.
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
- Do not interact with the user's desktop or installed macOS app unless explicitly requested; visual QA must use screenshots the user provides, automated non-UI verification, or an isolated test environment.
- Do not boot or use an iOS simulator unless the user explicitly requests it; prefer existing physical devices or non-UI verification.
- Do not drive a physical phone with stale ADB screen coordinates. Prefer asking the user or semantic controls; if a coordinate tap is unavoidable, capture and verify a fresh screenshot immediately first, and never guess around system panels or connectivity controls.

## Product UI
- Notion Calendar-like infinite week navigation means a rolling seven-day window that advances continuously one day at a time with trackpad/swipe; never paginate it in whole-week jumps or substitute a vertically stacked month/week list.
- Default to omission: keep screens clean and sparse, render no row for absent values, and avoid placeholders such as “Empty” or explanatory copy unless it enables a necessary action.
- Notion-style side panels must keep the workspace visually connected: never dim the background; use a clean edge and outside-click dismissal instead of a dark modal scrim.
- Keep product source, tests, documentation, and summaries exclusively current-state; do not preserve implementation-history inventories or compatibility terminology that can confuse future context.
- Use simple user language everywhere, including optional detail sections; show raw technical values only when they are required to use the feature.
- Do not add persistent instructional prose for direct-manipulation UI; make the interaction discoverable through the control itself and keep the screen visually quiet.
