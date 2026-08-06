# ADR-006: Client Storage, Migration, and Verification

Status: **Accepted plan**

## React Native storage

Use SQLCipher through `expo-sqlite` with a custom development/production build.

Local database responsibilities:

```text
materialized_object   decrypted state inside encrypted DB file
local_operation       encrypted signed operation archive
outbox                pending record IDs
sync_cursor           last atomically applied server sequence
known_device_head     highest signed head per device
key_metadata          wrappers and non-secret key metadata
conflict_journal      bounded recoverable losing values/revisions
projection_*          local search, backlink, task, and kanban indexes
blob_cache            encrypted/local attachment state
```

The SQLCipher key is random and protected by platform secure storage. SecureStore is not the database and is not the only recovery source. Expo documents that iOS Keychain values may survive reinstall while Android values do not; initialization and wipe flows must handle both states explicitly.

## Web storage

The web client must decrypt on the client. Server Components may render the shell and public content but cannot render private note bodies under full E2EE.

Implemented foundation:

- encrypted records and wrappers in IndexedDB
- keys unwrapped in client memory
- atomic local record/outbox/device-head and pulled record/cursor/device-head transactions
- local in-memory/materialized indexes after unlock; private materialized note data is not persisted in plaintext IndexedDB
- no third-party scripts on the vault origin
- strict CSP and Trusted Types where practical
- explicit cache/version handling to avoid old client protocol misuse

SQLite-WASM/OPFS is a later performance option, not a prerequisite.

## Mobile runtime

- Native shell handles navigation, secure storage, SQLCipher, sync, background tasks, notifications, and file access.
- Tiptap and Excalidraw run from bundled local assets inside restricted WebViews when needed.
- WebViews receive only scoped document data through a validated message bridge.
- Remote navigation, arbitrary origins, debug inspection in release, and broad native command access are disabled.
- Editor output is schema validated before entering the local transaction.

## Background synchronization

Continuous background execution is not assumed.

- Foreground: immediate push/pull with WebSocket/SSE wake hints.
- Network regain: flush outbox and pull.
- App start/resume: always reconcile.
- iOS: opportunistic BGTaskScheduler execution controlled by the OS.
- Android: persistent but deferrable WorkManager jobs.
- Push: contains no content; only a wake-up hint/vault identifier.

Correctness must hold if background execution never occurs.

## Migration from current plaintext schema

Use a single-user flag-day migration rather than indefinite dual mode.

1. Freeze writes and create an offline server backup.
2. Launch a trusted migration client over TLS.
3. Fetch all notes, blocks, folders, links, canvases, settings, and attachments.
4. Generate the vault/key hierarchy locally.
5. Convert current records into versioned local authoritative documents.
6. Build local projections and validate counts/relationships.
7. Encrypt and upload initial checkpoints/blobs.
8. Download and decrypt the new vault on a second client or isolated verifier.
9. Compare deterministic plaintext manifests/hashes locally; hashes are not uploaded.
10. Mark the account `e2ee_enforced` and disable plaintext private CRUD routes.
11. Remove plaintext private tables/columns only after explicit verification.
12. Identify and expire plaintext backups according to a documented plan.

Rollback before step 10 uses the frozen backup. After plaintext purge, rollback means restoring that backup and knowingly returning to non-E2EE mode.

## Implementation phases and gates

### Phase 0 — architecture contract

- threat model and ADRs accepted
- disclosure boundaries accepted
- protocol version namespace assigned

### Phase 1 — crypto provider

Status: **web/Node implementation complete; browser runtime and React Native provider gates pending**

- platform provider interface
- canonical encoder
- XChaCha/Argon2/libsodium sealed-box/signature prototype
- Node, browser, iOS, and Android golden vectors
- key-wrapper and envelope property tests

Gate: identical vectors and failure behavior on every target.

### Phase 2 — deterministic sync simulator

Status: **record-chain, key-epoch, checkpoint/ack, attachment, Yjs, Excalidraw, 10,000-operation convergence, model-level crash boundaries, and atomic IndexedDB adapter gates passing; browser E2E and mobile SQLCipher adapter validation pending**

Simulate at least:

- duplicate/reordered records
- interrupted batches
- long offline periods
- same-note concurrent edits
- concurrent move/delete
- clock skew
- missing key epoch
- revoked device
- malformed/signature-invalid records
- checkpoint restore and compaction
- 10,000+ operations with convergence assertion

Gate: no silent data loss and deterministic convergence.

### Phase 3 — blind server

- device registry
- sync push/pull/ack
- checkpoint/blob APIs
- quotas and abuse limits
- encrypted backup/restore drill

Gate: server integration tests prove no private plaintext fields or logs.

### Phase 4 — web cutover

- client vault unlock
- local projections
- encrypted sync
- migration tool
- publication boundary
- external MCP disclosure boundary

Gate: verified migration and plaintext API disabled.

### Phase 5 — React Native

- SQLCipher and SecureStore
- sync engine
- pairing/recovery/revocation
- offline bundled editors
- background wake integrations

Gate: airplane-mode feature tests and multi-device partition tests.

## Verification strategy

### Cryptography

- known-answer/golden vectors
- nonce uniqueness tests
- AAD substitution tests
- corrupted tag/header/wrapper tests
- KDF parameter upgrade tests
- decoder fuzzing and strict size limits

### Synchronization

- model/property-based tests over random operation schedules
- duplicate, reorder, drop, retry, and partition fault injection
- crash at every transaction boundary
- cursor/state atomicity
- checkpoint restore from clean device

### Security

- no plaintext in server DB, logs, traces, analytics, push payloads, or crash reports
- mobile secure-storage and backup configuration review
- WebView bridge allowlist review
- dependency/SBOM and reproducible build checks
- external cryptographic design review before production security claims

### Operations

- encrypted backup restore tested regularly
- recovery from lost only device tested
- device revoke and epoch rotation tested
- schema/protocol downgrade rejected
- old client behavior explicitly defined during mandatory upgrades

## Immediate code rule

No production encryption or sync implementation starts until Phase 1 chooses providers through a cross-platform prototype. Protocol types created before then must remain experimental and must not write durable user data.
