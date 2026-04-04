# TASK-017 Block Drag Handles And Contextual Block Menu

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Move the editor from simple hover controls to a clearer block-based interaction model closer to Notion.

## Scope

- Add visible block handles with drag intent and drop feedback.
- Add a contextual block menu for transform, duplicate, and delete actions.
- Keep all mutations on the canonical block AST path.

## Acceptance

- Blocks can be reordered with an interaction more direct than arrow buttons.
- The block menu uses `blockId`-based mutations, not ad hoc DOM editing.
- Nested block structures remain valid after movement.
- Lint, typecheck, and build pass.

## Completed

- Added draggable block handle with drop indicator.
- Added contextual block menu for duplicate, transform, table edit, and delete.

## Out of Scope

- Realtime collaborative cursor handling
- Arbitrary rich page-layout editing

## Likely Files

- `src/components/editor/Editor.tsx`
- `src/domain/note/block-tree.ts`
- `src/server/api/notes.ts`
- `src/app/globals.css`
