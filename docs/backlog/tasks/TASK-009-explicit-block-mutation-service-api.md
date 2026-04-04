# TASK-009 Explicit Block Mutation Service API

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Expose explicit block-level note mutation services on top of the patch-based persistence core.

## Scope

- Add service-level operations for insert, update, move, and delete by `blockId`.
- Keep all operations on the canonical block AST path.
- Reuse the existing patch-based persistence layer rather than creating a parallel write path.

## Acceptance

- Note services expose explicit block mutation entry points.
- Common block operations can be performed without rebuilding ad hoc editor logic in components.
- Lint, typecheck, and build pass.

## Out of Scope

- Realtime collaboration
- CRDT synchronization
- Large AI-authored multi-block transforms

## Likely Files

- `src/domain/note/note.service.ts`
- `src/domain/note/block-tree.ts`
- `src/server/api/notes.ts`

## Completed

- Added explicit note service APIs for block insert, update, move, and delete operations.
- Implemented canonical AST transforms in `block-tree.ts` so mutation APIs reuse the same persistence path as full note saves.
- Exposed server actions for future editor command palette, patch workflows, and agent proposal flows.
