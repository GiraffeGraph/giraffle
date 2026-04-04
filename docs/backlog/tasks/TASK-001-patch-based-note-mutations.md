# TASK-001 Patch-Based Note Mutations

Status: Done
Priority: P0
Updated: 2026-04-04

## Goal

Replace full-document rewrite saves with block-level mutation primitives that preserve stable IDs and tree structure.

## Scope

- Add patch-based persistence that performs create, update, move, and delete effects at block level during note saves.
- Keep the canonical Tiptap/block AST decision intact.
- Reuse block IDs instead of deleting and recreating every block on common edits.
- Keep link extraction and note update timing coherent with the new mutation path.

## Acceptance

- Common block edits do not require deleting all blocks for a note.
- Block IDs survive simple edits and moves.
- Parent-child ordering remains valid after mutations.
- Lint, typecheck, and build pass.

## Out of Scope

- CRDT or realtime collaboration
- Cross-device sync protocol
- AI-driven bulk transformations

## Likely Files

- `src/domain/note/note.service.ts`
- `src/domain/note/block-tree.ts`
- `src/server/api/notes.ts`
- `src/components/editor/Editor.tsx`

## Completed

- `saveNoteContent()` now diffs incoming canonical blocks against persisted rows by `blockId`.
- Saves now create, update, and delete only the necessary block rows instead of deleting the full note document first.
- Parent-child rewiring is applied before deletions, so surviving children can move safely.
- Validation passed with lint, typecheck, and production build.

## Follow-up

- Public insert, update, move, and delete block APIs are split into `TASK-009`.
