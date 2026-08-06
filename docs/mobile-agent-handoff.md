# Agent Handoff — Giraffle React Native + Expo Mobile Application

Date: 2026-08-03
Status: **Implementation handoff — execute, do not only plan**
Repository: `/Users/efe/projects/GiraffeGraph/giraffle`

## 1. Mission

Build the Giraffle mobile application from beginning to end using **React Native, Expo, Expo Router, and strict TypeScript**.

The mobile application must:

1. Match the current web application's visual identity and interaction model as closely as a phone form factor permits.
2. Be genuinely offline-first. Plaintext authority belongs to the trusted device, not PostgreSQL.
3. Store local data in SQLite with SQLCipher enabled.
4. Protect vault keys with platform secure storage.
5. Preserve one canonical task across Notes, Stride, Tower, and Trek.
6. Preserve wikilinks and backlinks.
7. Use Markdown/MDX only for import/export, never as the canonical database.
8. Support optional authenticated, self-hosted, ciphertext-only synchronization according to the existing E2EE ADRs.
9. Contain no embedded AI model, local CLI execution, Spotter runtime, or in-app model execution.
10. Keep MCP as an external server integration only.

Do not return a proposal without implementation. Inspect, implement, test, visually verify, and document the result.

## 2. Critical working-tree safety

The repository currently contains a large, intentional, uncommitted web/domain redesign.

Mandatory safety rules:

- Never run `git reset`, `git checkout -- .`, `git restore .`, `git clean`, or any equivalent destructive command.
- Never stash or discard the current user's changes.
- Do not rewrite unrelated web files.
- Place the mobile application under `apps/mobile/`.
- Existing web files may only be changed when a shared contract or ciphertext-only sync endpoint is strictly required.
- Before changing a web/Prisma file, inspect its current diff and preserve all unrelated edits.
- Do not commit unless the user explicitly asks.
- Never delete or replace reusable Giraffle brand assets.

## 3. Mandatory project instructions

Read and follow:

- `AGENTS.md`
- Relevant Next.js 16 guides in `node_modules/next/dist/docs/` before changing web routes, route handlers, forms, configuration, or server components.
- `docs/architecture/domain-model.md`
- Every file under `docs/architecture/e2ee/`, including all cross-references.
- `README.md`
- `docs/mcp.md`
- `docs/self-hosting.md`
- `prisma/schema.prisma`

Useful visual and implementation references:

- `src/styles/tokens.css`
- `src/styles/system.css`
- `src/styles/base.css`
- `src/styles/layouts/app-layout.css`
- `src/styles/layouts/sidebar-v2.css`
- `src/styles/layouts/sidebar-rail-v2.css`
- `src/styles/layouts/editor.css`
- `src/styles/layouts/kanban.css`
- `src/styles/layouts/stride.css`
- `src/styles/layouts/tower-matrix.css`
- `src/styles/layouts/savanna.css`
- `src/components/sidebar/Sidebar.tsx`
- `src/components/right-rail/RightRail.tsx`
- `src/components/notes/NoteEditorPage.tsx`
- `src/components/kanban/*`
- `src/components/stride/*`
- `src/components/tower-matrix/TowerMatrix.tsx`
- `src/components/savanna/*`

## 4. Current verified web/domain state

The current web application is healthy and verified:

- ESLint passes.
- TypeScript passes.
- 25 test files and 132 tests pass.
- Production build passes.
- Prisma baseline is clean and applied.
- PostgreSQL FTS remains a stored generated `tsvector` with a GIN index.
- Development server uses `http://localhost:3001`.

Current product/domain boundaries:

### Page and block

- Prisma still calls the user-facing page model `Note` for compatibility.
- `src/domain/note/page.service.ts` owns page metadata, block-tree persistence, archive/export, and hierarchy placement.
- A page owns stable block IDs and a canonical Tiptap-compatible block tree.
- Folders organize pages; they are not content owners.

### Tasks

- A `taskItem` block is the task's content anchor and stable identity.
- `TaskMetadata` owns completion, priority, due date, duration, and description.
- `PagePriority` separately owns a page's Tower slot.
- `src/domain/note/task.service.ts` owns task mutations and Stride/Tower projections.

### Trek

- A board is an explicit `Board`, not a special Note.
- `BoardStatus`, `BoardColumn`, and `BoardTask` are explicit relational records.
- `BoardTask` links board placement to a canonical task block.
- A board currently has a private backing `taskSourceNote` only to host canonical task blocks in the Tiptap block model.
- That private source is excluded from Notes, folders, archive, search, wikilink discovery, and Savanna.

### Savanna

- `Canvas.elements` is canonical Excalidraw scene data.
- `CanvasReference` is a relational projection from stable canvas element ID to Note ID.
- Canvas saves update scene data and rebuild references transactionally.

### Shared-task invariant

A task is created once:

- Notes owns its block/content.
- Stride reads/writes scheduling metadata.
- Tower reads/writes priority metadata.
- Trek reads/writes board and column placement.

Never duplicate tasks into feature-specific stores.

## 5. Product surfaces that mobile must implement

All surfaces must be functional; do not create decorative placeholder screens.

### 5.1 App shell

Reproduce the current visual system:

- Giraffle branding and existing logo assets.
- Current light and graphite-night themes.
- Same typography hierarchy, spacing rhythm, border colors, accent color, muted text, control heights, and radii.
- Flat sections and divider-based rows.
- No generic nested card-on-card interface.
- No gradients unless the current source deliberately uses one.
- No oversized hero treatment.
- No duplicated navigation.

Phone adaptation:

- Left content sidebar becomes a drawer/sheet opened from the top app bar.
- Preserve one canonical Pages tree in that drawer.
- Preserve the right utility rail's responsibilities as a bottom utility bar or focused utility sheet on phones.
- Archive, Settings, Account, Help, theme, sync, and sign-out belong to the utility surface, not the content drawer.
- Do not duplicate utility actions in the Pages drawer.
- Respect safe areas, keyboard insets, rotation, Dynamic Type, and screen-reader labels.

Tablet adaptation:

- Use a persistent content sidebar where width permits.
- Preserve the dedicated utility rail.
- Detail/editor panes may sit beside lists where usable.

### 5.2 Authentication and vault onboarding

Implement:

- Local vault creation.
- Vault unlock.
- Secure local database key generation.
- Optional account login/register for self-hosted sync.
- Recovery enrollment matching the E2EE ADRs.
- Trusted-device enrollment and revocation UX if the server protocol supports it.
- Clear distinction between local vault access and server account authentication.

A user must be able to use the app fully offline without configuring sync.

### 5.3 Notes and folders

Implement:

- Flat All Notes list with page, location, and updated metadata.
- Unified Pages hierarchy containing root notes and nested folders.
- Create, rename, move, archive, restore, pin, and delete.
- Folder detail using the same flat page-list language.
- Wikilinks and backlinks.
- Local FTS search plus advanced operators where practical.
- Markdown and MDX import/export.
- Attachments with encrypted local storage metadata.

### 5.4 Note editor

Preserve canonical Tiptap document compatibility.

Preferred approach from the accepted ADR:

- Bundle a local editor artifact inside the app.
- Host it in `react-native-webview` without loading remote editor code.
- Use a narrow, versioned, runtime-validated native bridge.
- Bridge initial document, transactions/updates, focus, selection, links, task toggles, attachment requests, theme, and save state.
- Keep stable block IDs.
- No remote webpage as the offline editor.
- Ensure the editor works with airplane mode enabled.

The mobile editor should visually match the current editor: simple page breadcrumb/top bar, title, clean document surface, and no editor tabs.

### 5.5 Trek

Implement:

- Board overview grouped by relational status columns.
- Board creation, rename, icon, delete.
- Status-column create/update/move/delete.
- Board-column create/update/move/delete.
- Task/card create, edit, move, complete, and delete.
- Card date, priority, duration, and description.
- Flat divider-based board presentation matching current Trek.
- Drag-and-drop where reliable; provide accessible move actions as a complete fallback.

### 5.6 Stride

Implement:

- Day, week, month, and custom/date-range views where current behavior requires them.
- Backlog with active/all/done filters and search.
- Schedule/unschedule and duration changes.
- Source labels that open the actual source page or board.
- Date/priority/completion changes must update the same canonical task.

### 5.7 Tower Matrix

Implement:

- Page-level matrix using `PagePriority`.
- Explicit distinction between page placement and task priority.
- Select a page to show its tasks in the right/detail matrix.
- Add, prioritize, and complete tasks.
- Phone layout should switch between page matrix and selected-page task matrix instead of shrinking both until unusable.

### 5.8 Savanna

Implement an offline bundled canvas experience:

- Bundle Excalidraw or a compatibility-preserving local canvas artifact in a WebView.
- Never depend on remote editor assets at runtime.
- Create, rename, list, open, save, and delete canvases.
- Drag/add references to existing pages.
- Open or preview referenced pages.
- Preserve stable Excalidraw element IDs.
- Rebuild `CanvasReference` projection transactionally from live scene elements.
- Follow the existing element-level conflict ADR.

### 5.9 Remaining utility surfaces

Implement:

- Search.
- Archive.
- Settings.
- Account.
- Secrets/configuration UI only when meaningful on a mobile client.
- Help drawer/sheet with contextual Notes/Trek/Stride/Tower/Savanna relationship explanations.
- Theme controls.
- Sync status, queue, last-success timestamp, retry, and actionable error states.

## 6. Mobile technical architecture

### 6.1 Location and tooling

Create the app under:

```text
apps/mobile/
```

Use:

- React Native
- Expo
- Expo Router
- strict TypeScript
- compatible Expo development builds/custom dev client
- React Native Reanimated and Gesture Handler where justified
- `StyleSheet`-based design tokens or an equally explicit typed token layer

Do not depend on Expo Go for SQLCipher functionality. Configure the required native prebuild/config-plugin path and document it.

Avoid introducing a UI framework that makes exact visual parity harder. Do not use generic framework cards as the base visual language.

### 6.2 Local encrypted persistence

Implement a versioned local schema and migration runner for SQLCipher-backed SQLite.

Minimum relational tables:

- vault metadata
- folders
- pages/notes
- blocks
- links and backlink projection
- page priorities
- task metadata
- board statuses
- boards
- board columns
- board tasks
- canvases
- canvas references
- media/attachment manifests
- encrypted outbox
- applied operation IDs/idempotency records
- sync cursors
- trusted device metadata
- encrypted checkpoint metadata

Requirements:

- Foreign keys enabled.
- Mutations are transactional.
- Stable UUIDs are generated client-side.
- Local FTS is device-side and rebuildable.
- Derived indexes are not authoritative sync state.
- Tests cover migrations from every committed schema version.
- Database opening fails closed when the key is wrong.

### 6.3 Key protection

Follow `docs/architecture/e2ee/002-cryptography-and-keys.md` exactly.

At minimum:

- Generate a random vault/database key.
- Protect wrapping material with iOS Keychain / Android Keystore through an Expo-compatible secure-storage layer.
- Never store plaintext keys in AsyncStorage, logs, crash reports, Redux/Zustand persistence, or source files.
- Zeroize temporary key buffers where the platform/runtime permits.
- Implement passphrase/recovery wrappers using the accepted parameters and existing test vectors.

### 6.4 Local mutation transaction

Every user mutation must atomically:

1. Update local canonical plaintext state.
2. Update relevant local projections.
3. Create a deterministic/versioned sync operation.
4. Encrypt the operation envelope.
5. Append the ciphertext to the durable outbox.

Do not acknowledge a local mutation before the transaction is durable.

### 6.5 Sync client and ciphertext-only server

Read all sync/E2EE ADRs before implementation.

The self-hosted server must never receive plaintext page titles, bodies, tasks, folder names, board names, canvas content, attachment content, or search projections.

If the required server persistence/API does not yet exist, add the minimum isolated authenticated implementation to the existing web server and Prisma schema. Read the relevant Next.js 16 route-handler docs first.

Server storage may contain only:

- ciphertext operation envelopes
- encrypted checkpoints/snapshots
- encrypted attachment chunks/manifests
- device IDs/public signing or agreement keys
- revocation/enrollment metadata
- opaque entity IDs where required by the accepted protocol
- sync cursors and receipt metadata

Requirements:

- Pull/push are idempotent.
- Replay and tampering are rejected according to ADRs.
- Device chain and revocation checks are enforced.
- Checkpoint acknowledgements and pruning follow the accepted protocol.
- Bounded payload sizes and pagination are enforced.
- Do not repurpose plaintext `OperationLog` as the E2EE sync store.
- Existing web functionality and external-only MCP behavior must remain intact.

### 6.6 Conflict handling

Implement the accepted model rather than generic last-write-wins:

- Tiptap: Yjs updates.
- Metadata: field-level LWW using HLC + device ID + operation ID ordering.
- Ordered collections: stable position IDs and deterministic tie-breaking.
- Excalidraw: element-level version merge and tombstones.
- Attachments: immutable encrypted blobs/manifests.
- Keep a bounded recoverable conflict journal for losing metadata values.

Reuse or port the existing logic and test vectors in:

- `src/domain/e2ee/*`
- `tests/vectors/*`
- `tests/unit/domain/e2ee-*.test.ts`

Do not silently change the wire format. Cross-platform vectors must match byte-for-byte.

## 7. Design parity contract

Extract mobile tokens from the current web tokens rather than inventing a second visual language.

Create a typed token module covering:

- light and graphite-night colors
- background/surface/hover/pressed states
- primary and subtle accent
- text primary/secondary/muted
- border and divider colors
- danger/success/warning states
- spacing scale
- control heights
- radii
- typography sizes/weights/line heights
- elevation only where current overlays require it

Parity rules:

- Content widths and density should feel like the current app.
- Lists are rows separated by dividers.
- Controls are compact and quiet.
- Empty states are restrained, not giant illustrations.
- Dialogs and sheets use one clear surface, not nested cards.
- Brand icon and name remain intact.
- Stored Material Symbol names must render as icons, never raw strings.
- Keep source labels visible for shared tasks.

Capture reference screenshots from the current web app at phone and desktop widths before finalizing mobile screens. Produce mobile screenshots for equivalent populated and empty states.

## 8. Suggested internal mobile structure

Use this as a guide, not an excuse for unnecessary abstraction:

```text
apps/mobile/
  app/                       # Expo Router routes
  src/
    components/
      shell/
      notes/
      editor/
      trek/
      stride/
      tower/
      savanna/
      ui/
    design/
      tokens.ts
      themes.ts
      typography.ts
    domain/
      page/
      block/
      task/
      board/
      canvas/
      link/
      sync/
      e2ee/
    infrastructure/
      database/
      secure-storage/
      sync/
      attachments/
      webview-bridge/
    state/
    lib/
  assets/
  plugins/
  tests/
  app.config.ts
  eas.json
  package.json
  tsconfig.json
```

Keep domain code independent from React components. Keep SQLite, SecureStore, network, and WebView details behind narrow infrastructure adapters.

## 9. Testing requirements

Implement and run:

### Unit tests

- IDs and ordering.
- Local schema migrations.
- Task/page/board/canvas domain operations.
- HLC/LWW/conflict rules.
- Crypto wrappers and canonical encoding.
- Existing cross-platform vectors.
- Canvas reference extraction.
- Wikilink parsing.

### Integration tests

- SQLCipher database open/close/reopen with correct and incorrect keys.
- Mutation + encrypted outbox atomicity.
- Page/task shared-view consistency.
- Board task appears in Stride and uses the same TaskMetadata.
- Page priority differs from task priority.
- Canvas save + CanvasReference transaction.
- Push/pull idempotency and replay handling.
- Offline mutation followed by sync.

### Component tests

- Navigation shell/drawer/utility bar.
- Notes hierarchy.
- Editor bridge message validation.
- Trek moves.
- Stride scheduling.
- Tower page/task switch.
- Theme parity.

### End-to-end or device smoke tests

At minimum:

1. Create and unlock a vault.
2. Create folder and page.
3. Edit page offline and restart app.
4. Create a task.
5. Schedule it in Stride.
6. Prioritize it in Tower.
7. Place/edit it in Trek without creating a duplicate.
8. Add the page to Savanna.
9. Search and archive/restore.
10. Enable sync, push ciphertext, reinstall/second-device restore if environment permits.
11. Verify airplane-mode startup and editing.

Use Maestro or an Expo-compatible E2E approach if the environment supports it. If a simulator is unavailable, still run all static/unit/export checks and produce Expo web/device-development screenshots where valid, explicitly documenting the unavailable native-only check.

## 10. Build, CI, and documentation

Provide:

- Reproducible install commands.
- Development build instructions for iOS and Android.
- SQLCipher/prebuild instructions.
- Required environment-variable template without secrets.
- EAS development/preview/production profiles.
- Mobile lint, typecheck, tests, and export scripts.
- CI workflow for deterministic lint/typecheck/test/export.
- Architecture README under `apps/mobile/`.
- Sync security notes.
- Known native setup constraints.

Do not claim Expo Go support if SQLCipher or another native module requires a development build.

## 11. Definition of done

The task is complete only when:

- `apps/mobile/` contains a runnable Expo app, not mockups.
- Major listed product surfaces are implemented and connected to the encrypted local database.
- Shared-task invariants are enforced by code and tests.
- The UI closely matches current Giraffle styling in both themes.
- The application functions offline after first install/vault creation.
- SQLCipher and secure key storage are configured for native builds.
- Sync, if configured, sends only ciphertext and required opaque metadata.
- No in-app AI runtime exists.
- Mobile lint/typecheck/tests pass.
- Expo/native build or export checks pass as far as the environment supports.
- Existing web lint/typecheck/tests/build remain green.
- Prisma migration status/diff remains clean if server schema changed.
- `git diff --check` passes.
- Temporary users, test records, screenshots, and generated debugging artifacts outside intentional test fixtures are cleaned up.

## 12. Required final report

Return a concise but complete report containing:

1. Architecture implemented.
2. Main files and directories added.
3. Product surfaces completed.
4. Offline/SQLCipher/key-management behavior.
5. Sync protocol/server changes.
6. Test/build commands and exact results.
7. Visual verification performed.
8. Remaining blockers, if any, with concrete reasons rather than vague TODOs.
9. Current `git status --short` summary, distinguishing pre-existing web changes from mobile-agent changes.

Do not hide incomplete native-only verification. Do not mark placeholder screens as completed.
