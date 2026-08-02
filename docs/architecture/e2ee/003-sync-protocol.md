# ADR-003: Encrypted Synchronization Protocol

Status: **Accepted; canonical wire, key-epoch, checkpoint, and deterministic simulator prototypes passing**

## Model

Synchronization is an append-only opaque record log. The server does not execute domain mutations. Clients decrypt records, apply deterministic merge rules, and maintain local materialized state.

The existing `OperationLog` is not reused: it records plaintext server-side effects after they occur and has no idempotency, device sequence, cursor, cryptographic integrity, or convergence semantics.

## Server-visible record

```ts
interface SyncRecordV1 {
  protocolVersion: 1;
  recordId: string;          // random UUID; idempotency key
  vaultId: string;
  deviceId: string;
  deviceSequence: number;    // monotonic per device
  previousRecordHash: Uint8Array;
  objectLocator: Uint8Array; // keyed BLAKE2b-256 over domain-separated object ID
  keyEpoch: number;
  envelope: Uint8Array;      // canonical encrypted envelope
  signature: Uint8Array;     // signs canonical header + envelope
}
```

The encrypted payload contains the real object ID/type, operation timestamp, mutation, payload schema, and conflict metadata.

The wire representation uses RFC 8949 deterministic CBOR through `cborg`. Giraffle permits only null, booleans, safe integers, strings, byte strings, arrays, and plain string-keyed maps. Floats, bigint, undefined, tags, indefinite-length values, duplicate map keys, non-minimal integers, and non-canonical map ordering are rejected. Decode is followed by canonical re-encoding and byte comparison to close decoder strictness gaps. The durable compatibility fixture is `tests/vectors/sync-record-v1.json`.

## Minimal server tables

```text
vault
  id, owner_id, protocol_version, created_at

device
  id, vault_id, signing_public_key, agreement_public_key,
  status, authorized_at, revoked_at, last_ack_server_seq

sync_record
  server_seq BIGINT identity, vault_id, record_id, device_id,
  device_seq, previous_record_hash, object_locator, key_epoch,
  envelope BYTEA, signature BYTEA, received_at

checkpoint
  id, vault_id, covers_server_seq, key_epoch, nonce,
  ciphertext, signature, created_by_device_id, created_at

checkpoint_ack
  checkpoint_id, vault_id, device_id, checkpoint_hash,
  applied_server_seq, signature, acknowledged_at

blob
  id, vault_id, key_epoch, encrypted_size_bytes, chunk_count,
  storage_key, encrypted_manifest, created_at

key_wrapper
  id, vault_id, recipient_kind, recipient_id,
  wrapper_version, encrypted_vault_root_key, created_at, revoked_at
```

Required uniqueness:

- `(vault_id, record_id)`
- `(vault_id, device_id, device_seq)`
- server sequence monotonically increases within a vault pull stream

The server validates size, device status, sequence continuity where possible, signature, quotas, and duplicate IDs. It cannot validate decrypted mutation semantics.

## API

```text
POST /v1/vaults/:vaultId/sync/push
GET  /v1/vaults/:vaultId/sync/pull?after=<serverSeq>&limit=<n>
POST /v1/vaults/:vaultId/checkpoints
POST /v1/vaults/:vaultId/acks
POST /v1/vaults/:vaultId/blobs
GET  /v1/vaults/:vaultId/blobs/:blobId
```

Push and pull use bounded batches. A partial network failure may repeat the entire batch; record IDs make the operation idempotent.

## Local write transaction

A mutation is durable locally before sync:

```text
BEGIN IMMEDIATE
  apply mutation to local materialized state
  append encrypted/signed record to local operation log
  append record ID to outbox
  advance local device sequence and hash-chain head
COMMIT
```

If encryption/signing fails, neither state nor outbox commits.

## Sync state machine

```text
IDLE
  -> PUSH_OUTBOX
  -> PULL_AFTER_CURSOR
  -> VERIFY_HEADERS_AND_SIGNATURES
  -> DECRYPT_AND_VALIDATE
  -> APPLY_IN_LOCAL_TRANSACTION
  -> ACK_CURSOR
  -> IDLE
```

On failure:

- network error: retain outbox and retry with bounded exponential backoff + jitter
- duplicate push: accept existing record as success
- bad signature/AEAD/schema: quarantine record, stop cursor advancement, surface a blocking integrity error
- device sequence gap: stop and request missing range; never skip silently
- unknown key epoch: retain encrypted record and fetch wrappers; do not discard
- clock skew: merge via HLC rules, not wall-clock order

## Pull cursor

`serverSeq` is transport ordering, not semantic conflict ordering. The client persists the cursor only in the same transaction that applies all records through that cursor.

A notification does not advance state. Push notifications and WebSocket/SSE messages contain only a vault wake-up hint; the client always pulls authoritative encrypted records.

## Checkpoints and compaction

Because the server cannot merge encrypted operations, a trusted client periodically creates an encrypted full-vault materialized-state checkpoint. The encrypted payload contains the state schema, per-device sequence/hash frontier, and canonical state. Server-visible metadata, nonce, and ciphertext are signed by the producing device; the metadata is also bound as AEAD additional data.

After downloading, signature verification, decryption, schema validation, restore, and atomic cursor advancement, each device emits a signed checkpoint acknowledgement. A checkpoint declares `coversServerSeq`, but the server cannot prove the declaration. Therefore old records are removed only when:

1. the checkpoint decrypts and validates on at least one other active device when available;
2. all active devices acknowledge a cursor at or beyond its coverage, or an explicit stale-device policy applies;
3. minimum history retention has elapsed;
4. an encrypted backup containing the prior history has passed restore verification.

The implemented policy evaluator keeps these gates separate: complete active-device acknowledgement is necessary but never sufficient by itself to delete history. Revoked devices do not block compaction; newly active devices do.

Yjs update compaction must load a Y.Doc to garbage-collect deleted content; binary update merging alone does not garbage-collect.

## Deletion

Deletion emits encrypted tombstones. Physical deletion occurs after:

- tombstone retention
- all active-device acknowledgement or stale-device expiry
- checkpoint coverage
- attachment reference reconciliation on a trusted client

## Rollback and fork detection

Clients retain per-device signed heads and highest seen sequence. Replayed records are idempotent; records below a known head cannot replace newer local state. If two valid successors claim the same device sequence/head, the device history is forked and sync stops for explicit recovery.

The protocol cannot force a malicious server to deliver withheld records. It can detect gaps and later-observed forks, not guarantee availability.
