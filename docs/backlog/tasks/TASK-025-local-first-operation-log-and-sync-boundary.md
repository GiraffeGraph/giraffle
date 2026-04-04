# TASK-025 Local First Operation Log And Sync Boundary

Status: Planned
Priority: P2
Updated: 2026-04-04

## Goal

Create the first structurally correct boundary for later offline and sync behavior without pretending to ship full local-first today.

## Scope

- Define operation or mutation records that correspond to canonical note and folder changes.
- Establish a client-side persistence boundary for queued mutations or local cache snapshots.
- Keep PostgreSQL as the first-phase source of persisted truth while making sync evolution possible.

## Acceptance

- The repo has a clear place for mutation records or client-cache synchronization boundaries.
- Current note and block operations can be represented without losing block identity.
- The design does not lock the product out of later local-first sync.
- Lint, typecheck, and build pass.

## Out of Scope

- Full CRDT implementation
- Multi-device conflict UX in the same pass

## Likely Files

- `src/domain/note`
- `src/domain/folder`
- `src/server/api/notes.ts`
- `src/server/api/folders.ts`
- `src/lib`

