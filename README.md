<p align="center">
  <img src="./public/web-app-manifest-192x192.png" alt="Giraffle logo" width="112" height="112" />
</p>

<h1 align="center">Giraffle</h1>

<p align="center">
  A private, offline-first workspace for recursive pages, personal planning and visual thinking on macOS, iOS, Android and the browser. Your data stays on your device; optional self-hosted sync only relays ciphertext.
</p>

<p align="center">
  <img alt="Expo SDK 57" src="https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-encrypted-003B57?logo=sqlite&logoColor=white">
  <img alt="End-to-end encrypted" src="https://img.shields.io/badge/E2EE-yes-1F883D">
</p>

<p align="center">
  <a href="#why-giraffle">Why Giraffle</a> •
  <a href="#what-it-looks-like">What it looks like</a> •
  <a href="#features">Features</a> •
  <a href="#running-the-client">Running the Client</a> •
  <a href="#headless-cli">Headless CLI</a> •
  <a href="#building-the-client">Building</a> •
  <a href="#hosting-the-sync-relay">Hosting the Relay</a> •
  <a href="#pairing-a-second-device">Pairing</a> •
  <a href="#repository-layout">Layout</a>
</p>

## What it looks like

One sidebar holds the whole workspace: search, Today, Calendar, Inbox, Plan, Canvas, then your favourites and the page tree, draggable into any shape. Calendar gives every scheduled Page a day, week and month home, with an hourly timeline, quick capture, direct rescheduling and private device reminders. A page opens as a document — an icon, a title, its state, priority and date as property rows, then the writing surface. Hovering a block reveals a `+` and a drag handle; `/` opens the block menu; `⌘K` searches titles and the words inside every page.

| Key | Does |
| --- | --- |
| `⌘K` | Open the command palette — pages, actions, and text found inside documents |
| `⌘N` | Make a page and open it |
| `⌘\` | Collapse or restore the sidebar |
| `/` | Open the block menu wherever a word begins |
| `Esc` | Close whatever is open |

## Why Giraffle

Giraffle is an opinionated personal tool built first for one person's real daily use. It is open source so its behavior can be inspected, learned from and forked—not because it aims to become team software or satisfy every workflow.

One Expo Universal client serves native iOS, native Android and web, with a hardened Electron shell for macOS. An optional relay moves encrypted changes between your own devices.

Three rules shape every decision:

- **The device owns the data.** Every page and canvas is written to an encrypted SQLite database on the device. Every read and write works with the network off. There is no "loading" state waiting on a server.
- **The relay is blind.** Content is encrypted on the device with keys the device never sends anywhere. The relay stores opaque blobs and the metadata it needs to order them. Whoever runs it — including you — cannot read a page.
- **There is no account.** No sign-up, no email, no password, no server-side user record. A vault is identified by an id and an access token you generate yourself; a second device joins by being authorized by the first.

### The privacy model in plain terms

Your content is encrypted before they leave the app. The relay receives ciphertext, stores ciphertext, and hands ciphertext back to devices that hold the right token. It has no key, so a stolen database, a subpoena, or a curious operator yields nothing readable.

What the relay *does* see: how many records exist, roughly how big they are, when they were pushed, and which device pushed them. That is the cost of having a sync service at all. If you never turn sync on, it sees nothing, because you never run it.

## Features

- **Universal pages:** every note, idea, project and finishable action is one recursive Page
- **Custom states:** user-defined vocabulary mapped to stable Forever, Open and Done semantics
- **Local categories:** each Page can group only its direct children with its own categories
- **Planning views:** table and state board over the same Pages, plus a first-class day, week and month Calendar with timed overlap layout, continuous virtualized month scrolling, trackpad/swipe date navigation, drag-to-reschedule, duration resizing, editable recurring series, event colors, local reminders, `.ics` files and optional two-way Google Calendar sync on macOS
- **Quick capture:** creates an Open child Page in Inbox; organizing it moves it to one real parent
- **Block editor:** headings, lists, to-dos, quotes, code, images, callouts and toggle lists, reachable from `/` or a block's own menu
- **Find by content:** `⌘K` searches page titles and the text inside documents, with the surrounding words
- **Canvas:** Excalidraw shapes plus searchable live references to canonical Pages
- **Local first:** encrypted SQLite, device-held keys, offline reads/writes and a password or quick-PIN lock
- **Lock on your terms:** the lock timeout covers a browser reload too, from a minute to a day, or only when you lock it yourself
- **Headless CLI:** local agent and terminal control over the same macOS vault and canonical repository used by the UI
- **Optional sync:** ciphertext-only exchange between devices through a self-hosted blind relay
- **Encrypted backup:** password-protected full-workspace export and restore with a versioned `.giraffle` file

### Current product model

| Concept | Meaning |
| --- | --- |
| **Page** | The only canonical knowledge and planning entity; may contain direct child Pages |
| **State** | Custom user label with Forever, Open or Done semantics |
| **Category** | Optional grouping owned by one parent Page or the workspace root |
| **Priority** | Optional Focus / Plan / Delegate / Drop placement |
| **Calendar** | Optional local schedule and duration |
| **Archive** | Visibility lifecycle independent from State |
| **Canvas** | Excalidraw scene containing canonical Page references, never copies |

A normal note starts in the default Forever state. Quick capture creates an Open child Page in the visible **Inbox**. Moving it to its real parent removes it from Inbox and clears any category owned by the previous parent. State, priority, schedule, document and descendants move with it. Every Page can present its direct children as a list, by local category, or by priority; global Plan and Calendar lenses may query the whole workspace.

### Backup is not sync

Sync continuously replicates signed changes between devices in the same vault. A `.giraffle` backup is a password-encrypted point-in-time snapshot containing Pages, custom states, local categories, calendar metadata, priorities, canvases and archived content. It deliberately excludes device keys, quick PINs and relay credentials.

Backups restore only into an empty vault that has never synced; import never merges with existing content. Restored entities become new local operations on the importing device, so enabling sync later publishes them through the normal sync protocol.

## Running the Client

### Prerequisites

- Node.js 22 (the relay image and current development setup use Node 22)
- Xcode for iOS, Android Studio for Android, or a Mac for the macOS DMG. None is needed for the web target.

### Setup

```bash
cd apps/app
npm install
cp .env.example .env      # optional; leave EXPO_PUBLIC_SYNC_BASE_URL blank to stay fully offline
```

### Run

```bash
npm run ios          # native iOS, builds a dev client
npm run android      # native Android
npm run web          # browser
npm run desktop:dev  # macOS desktop shell
npm start            # dev server for an already-installed dev client
```

The client needs native modules (encrypted SQLite, libsodium, secure storage), so `npm run ios` / `npm run android` build a development client rather than running in Expo Go.

### Google Calendar on macOS

Google Calendar sync is an optional, single-account connection for the primary user's own Google account and primary calendar. It has no multi-user, team, account-switching or public OAuth service layer. Giraffle Pages remain canonical: Google events are imported as Pages with their schedule, description and color, local Page changes are exported, and deleting an event in Google removes its schedule without deleting the Page. The downloaded Desktop OAuth credential and refresh token are read only by the Electron main process and encrypted with `safeStorage` (macOS Keychain); the renderer receives only connection status. Only event IDs, sync cursors and timestamps are kept in local app storage. The integration requests Google’s narrow `calendar.events.owned` scope and uses incremental sync tokens, ETags and bounded retry handling.

To configure an open-source build:

1. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) in a Google Cloud project.
2. Configure an External OAuth consent screen and authorize only your own Google account. While its publishing status is **Testing**, add that account as a test user.
3. Create an OAuth client with application type **Desktop app**.
4. Download the OAuth JSON and choose **Settings → Your Google Calendar → Import OAuth JSON**. Giraffle validates that it is a Desktop credential, stores its client values encrypted in the Mac’s secure storage, and never copies the source JSON into the vault or repository.

The authorization flow follows Google’s [OAuth 2.0 for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app) guidance with PKCE and a random loopback callback. Synchronization follows the Calendar API’s [incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync), [event](https://developers.google.com/workspace/calendar/api/v3/reference/events) and [extended property](https://developers.google.com/workspace/calendar/api/guides/extended-properties) contracts. Google expires refresh tokens after seven days while an External consent screen remains in Testing with Calendar access. For a durable personal connection, move that private project to Production, accept the one-time unverified-app warning yourself, and do not distribute its client ID as a public service; broad public distribution is the case that would require verification.

### Checks

```bash
cd apps/app
npm run verify       # lint + typecheck + tests + export
```

From the repository root, `npm run verify` covers the shared packages and headless path — typecheck, command/executor tests, CLI build/tests and desktop socket tests.

## Headless CLI

Giraffle can be controlled with no visible window. The CLI is a local adapter over the exact same encrypted vault and `VaultRepository` used by the macOS UI: CLI writes appear in the UI, UI writes appear in CLI reads, and every mutation follows the existing sync operation path. If the desktop runtime is not running, the CLI starts it invisibly.

The CLI is not published to npm yet — publishing waits on a signed desktop release, because `giraffle desktop install` opens the release matching the CLI version. Build and link it from this repository:

```bash
npm install
npm --prefix apps/cli install
npm run cli:build
npm link --prefix apps/cli

giraffle desktop status

giraffle pages create "Release plan" --markdown "Ship on Friday"
giraffle pages capture "Draft announcement"
giraffle pages update PAGE_ID --priority do
giraffle pages search release --json
```

Without linking, use `npm run cli -- commands` from the repository root.

### Automation and agent use

Use `--json` for stable JSON output and exit codes, `--input` for a complete JSON input object, and `--stdin` for page content or quick capture. In non-interactive sessions, provide the passphrase through a protected file or the environment:

```bash
export GIRAFFLE_PASSPHRASE_FILE="$HOME/.config/giraffle/passphrase"

echo "Meeting notes" | giraffle pages create "Standup" --stdin --json
giraffle pages update PAGE_ID --state-id giraffle-state-done --json
giraffle categories list PAGE_ID --json
giraffle commands --json
```

`GIRAFFLE_PASSPHRASE` is also supported for ephemeral local automation. A command-line passphrase flag is deliberately not supported because process arguments can be inspected by other local processes. Exit code `0` means success, `2` means invalid command/input, `3` means an entity was not found, and `1` covers vault or runtime failures.

The CLI never opens, copies or migrates vault storage. It talks to the desktop runtime through a per-user local socket protected by a random `0600` token; the sandboxed renderer receives only validated command input through a narrow preload bridge. The command registry and repository executor live in `packages/headless`; `apps/cli` only handles terminal parsing and transport. This keeps one persistence model and one mutation implementation.

The npm package intentionally installs only the CLI. npm lifecycle scripts must not silently download or write an application into `/Applications`; `giraffle desktop install` explicitly opens the matching official release for user-approved installation. A future Homebrew Cask can install the notarized app and expose the CLI together.

Useful discovery commands:

```bash
giraffle --help
giraffle commands
giraffle pages create --help
giraffle states list --json
```

## Building the Client

```bash
cd apps/app
npm run export       # native JS bundles for iOS and Android
npm run export:web   # static web build
npm run desktop:mac  # unsigned universal macOS DMG for local testing
npm run prebuild     # regenerate the native ios/ and android/ projects
```

iOS and Android store builds go through EAS; see `apps/app/eas.json` for the profiles. The macOS artifact is written to `apps/app/release/macos/`. Public macOS distribution requires a Developer ID Application certificate and notarization; with signing credentials configured, use `npm run desktop:mac:signed`.

## Hosting the Sync Relay

The relay is a single small container. It needs no database server, no reverse proxy to function, and no configuration beyond one token.

### Quick start

```bash
cp .env.example .env
$EDITOR .env                                    # set SYNC_TOKENS
docker compose up -d --build
curl http://localhost:8787/health/ready         # {"status":"ready"}
```

`docker-compose.yml` runs one service, built from `apps/server/Dockerfile` with the repository root as the build context. Its SQLite database lives on the named volume `giraffle_sync_data`, mounted at `/data`.

### Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `SYNC_TOKENS` | yes | Comma-separated `vaultId:token` pairs. Generate a token with `openssl rand -base64 48`. |
| `SYNC_PORT` | no | Host port to publish on. Default `8787`. |
| `HOST` | no | Interface to bind when running outside Docker. Default `0.0.0.0`. |
| `PORT` | no | Port to listen on. Default `8787`. |
| `DATABASE_PATH` | no | SQLite file. Default `./data/giraffle-sync.db`; `/data/giraffle-sync.db` in the container. |

`SYNC_TOKENS` is the operator credential and the whole access-control system. The relay **replaces its token table from this variable on every boot**, so removing a pair revokes it at the next restart. Only the SHA-256 digest of each token is stored.

### Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health/live` | Process is up. Never touches the database. |
| `GET /health/ready` | Database is answering. |
| `POST /api/v1/vaults/:vaultId/devices` | Register a device. |
| `GET /api/v1/vaults/:vaultId/devices` | List registered devices. |
| `POST /api/v1/vaults/:vaultId/devices/:deviceId/authorization` | Authorize a pending device. |
| `GET /api/v1/vaults/:vaultId/devices/:deviceId/grant` | Fetch the wrapped key grant for a device. |
| `POST /api/v1/vaults/:vaultId/sync/push` | Upload encrypted records. |
| `GET /api/v1/vaults/:vaultId/sync/pull` | Download encrypted records. |

Everything under `/api/v1/vaults` requires the vault's bearer token. Put the relay behind TLS before exposing it to the internet — a terminating proxy or a tunnel, whichever you already run.

### Running without Docker

```bash
npm --prefix apps/server install
SYNC_TOKENS=my-vault:$(openssl rand -base64 48) npm --prefix apps/server run dev
```

## Pairing a Second Device

1. **Point both devices at the relay.** Set `EXPO_PUBLIC_SYNC_BASE_URL` to the relay URL. In the join screen, enter the same vault id and the matching `SYNC_TOKENS` value as the connection code.
2. **The first device claims the vault.** It generates the vault key, wraps it with its own device key, and pushes encrypted records.
3. **The new device asks to join.** Open the join screen; it registers itself and waits, unauthorized. The relay will not hand it any key material yet.
4. **The first device approves it.** Approving signs the new device into the vault's device chain and uploads the vault key wrapped for that device alone. The relay relays that blob without being able to open it.
5. **The new device pulls.** It unwraps the key with its own device key and decrypts the history locally.

Only a device that already holds the vault key can admit another one. The relay's token proves *which vault* you are talking to; it does not, on its own, let anyone read that vault.

## Repository Layout

```text
apps/
  app/            Expo Universal client — iOS, Android, web, macOS desktop shell
    desktop/      sandboxed Electron host and macOS packaging configuration
  cli/            headless terminal adapter for the desktop vault runtime
  server/         blind sync relay (Hono + SQLite), with its own Dockerfile
packages/
  domain/         recursive pages, states, categories, links, ordering and Markdown
  headless/       transport-neutral command registry and workspace application service
  protocol/       canonical CBOR, crypto provider, device chain, HLC, sync records
  sync/           key wrapping, checkpoints, Yjs and Excalidraw merge, blob crypto
tests/vectors/    frozen protocol test vectors, shared by the client and the packages
public/           logo used by this README
docker-compose.yml  runs the relay
```

The client, CLI and relay install themselves independently; the root workspace owns `packages/*` and verifies the CLI as part of the repository quality gate.

## Agent Control

A local agent runs the `giraffle` executable like any other command. `--json` provides deterministic success and error envelopes, `--input` accepts JSON directly or from a file/stdin, and mutations return canonical entity ids. The relay remains blind and is not involved in headless command execution.

## Releasing

`package.json` version must match the git tag, always in `vMAJOR.MINOR.PATCH` form.

```bash
npm run verify
npm --prefix apps/app run verify
npm --prefix apps/server run test
```
