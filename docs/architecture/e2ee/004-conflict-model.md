# ADR-004: Conflict and Document Model

Status: **Accepted hybrid model**

## Decision

Giraffle will not use one conflict algorithm for every entity and will not build a general-purpose CRDT from scratch.

| Data | Merge model |
| --- | --- |
| Tiptap note body | Yjs document updates |
| Note/folder metadata | Field-level LWW registers using HLC + device ID tie-breaker |
| Ordered folder/page/board collections | Stable IDs + deterministic fractional position + tombstones |
| TaskMetadata, PagePriority, and BoardTask | Field-level LWW + stable relational IDs |
| Excalidraw canvas | Element-level version merge + tombstones; conflict-preserving snapshot fallback |
| CanvasReference projection | Rebuilt transactionally from merged live elements |
| Attachments | Immutable blobs |
| Derived search/backlink/task indexes | Rebuilt locally; never authoritative sync data |

## Tiptap notes

Each note owns a separate Y.Doc. The official Tiptap Collaboration extension binds the editor to a Yjs fragment. Yjs updates are commutative, associative, and idempotent, so duplicated and reordered updates converge after every update is received. The implemented adapter bounds individual updates and batches, supports state-vector diffs, merges encrypted-operation payloads, and emits full-state checkpoint updates; malformed binaries stop application.

Rules:

- One note must not share a global workspace Y.Doc.
- Yjs binary updates are encrypted before leaving a device.
- Undo/redo uses Yjs-aware history; Tiptap's normal UndoRedo extension is disabled for collaborative documents.
- A note checkpoint stores an encrypted `Y.encodeStateAsUpdate` result plus encrypted metadata state.
- Clients maintain local plaintext/materialized block projections only inside the encrypted local database.
- Unknown Tiptap nodes are retained through migrations whenever possible instead of discarded.

The future mobile editor should use a bundled local Tiptap WebView when exact Yjs/Tiptap behavior is required. Remote web content is not an offline editor.

## Metadata registers

Scalar fields such as title, icon, archived, pinned, page-priority slot, task priority, and folder assignment use:

```ts
interface LwwValue<T> {
  value: T;
  clock: HybridLogicalClock;
  deviceId: string;
  operationId: string;
}
```

Comparison order:

1. HLC physical component
2. HLC logical counter
3. lexicographic device ID
4. lexicographic operation ID

Wall-clock time alone and locale-sensitive string comparison are forbidden. Deletion is an explicit presence register; only a newer explicit restore changes it back to visible. Field or move mutations never implicitly resurrect an object. Losing values are retained in a bounded local conflict journal so accidental overwrites can be recovered.

## Ordering

Array index is not stable under concurrent offline edits. Ordered collections use a fractional position identifier generated between neighbors and tied to an immutable entity ID.

Requirements:

- deterministic sort by position then entity ID
- position rebalance is a versioned operation, not an implicit server rewrite
- delete creates a tombstone
- move of a deleted entity does not resurrect it
- concurrent move conflicts keep one deterministic position and retain the losing mutation in conflict history
- parent assignments that target missing, deleted, or self nodes resolve to root
- if concurrent folder moves form a cycle, clients deterministically detach the oldest HLC/device/operation-ordered edge; node ID breaks an otherwise exact tie

A proven fractional-index implementation should be selected; ad hoc floating-point positions are forbidden.

## Excalidraw

Canvas snapshots are too coarse for silent last-write-wins. Each element is merged by stable element ID and Excalidraw version metadata, with an explicit deletion tombstone.

Initial rules:

- distinct element edits merge independently
- newer element version wins for the same element
- higher Excalidraw `version` wins; equal versions use the lower `versionNonce`, matching Excalidraw collaboration reconciliation
- signed operation ordering is the final fallback for equal version and nonce; identical ordering metadata with divergent payloads is an integrity error
- deletes remain tombstoned through retention
- incompatible concurrent edits preserve the losing canvas revision as a recoverable conflict copy
- `appState` is split into durable document state and ephemeral viewport/UI state; ephemeral state is not synchronized

The Excalidraw editor bundle is packaged inside the mobile app and communicates with native storage through a narrow validated bridge.

## Attachments

Attachments are immutable. Editing a file creates a new opaque blob ID, random DEK, and encrypted reference. This avoids partial binary conflict resolution.

Chunks are independently authenticated and may arrive out of order, but the encrypted manifest fixes the complete ordered chunk-hash set, total count, total plaintext length, and plaintext digest. Missing, duplicated, relocated, truncated, or replayed chunks fail package verification. A note operation references an attachment manifest only after the encrypted blob is durably queued. Missing blobs are represented as pending, not as a reason to reject the rest of the note.

## Derived projections

After applying mutations, clients transactionally update local projections:

- full-text search
- wikilink/backlink index
- unresolved links
- task and due-date index
- kanban/matrix projections
- attachment references

Projection code is deterministic and versioned. A projection can always be dropped and rebuilt from decrypted authoritative documents. Projection records are not synced unless later proven necessary for startup performance, and any synced projection remains encrypted and disposable.

## Conflict UX

Cryptographic correctness is insufficient if data disappears silently. Giraffle must expose:

- sync/integrity state per device
- unresolved conflict count
- recoverable prior field values
- canvas conflict copies
- unknown-schema records awaiting upgrade
- last successful checkpoint and backup verification

Integrity failures are never presented as an empty note.
