# TASK-003 Extended Block Surface And Slash Commands

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Grow the MVP editor beyond plain text, headings, lists, code, quote, and divider without breaking the canonical persistence model.

## Scope

- Extend slash commands for the next meaningful block types.
- Prioritize callout, toggle, image, and one clean path toward table support.
- Make sure persistence and serialization boundaries stay explicit.

## Acceptance

- Newly added block types can be created from the slash menu.
- Persisted block data survives save and reload.
- Serializer boundaries are updated or explicitly deferred in code comments where needed.
- Lint, typecheck, and build pass.

## Out of Scope

- Full Notion parity
- Complex nested database or collection blocks

## Likely Files

- `src/components/editor/extensions/slash-command.ts`
- `src/components/editor/Editor.tsx`
- `src/domain/note/note.types.ts`
- `src/domain/note/note.serializer.ts`
- `src/domain/note/block-tree.ts`

## Completed

- Added `callout` and `toggle` editor nodes plus image insertion from the slash menu.
- Extended slash commands with richer block creation and a table scaffold fallback while rich tables stay explicitly deferred.
- Updated canonical block types, block ID assignment, persistence, and Markdown parsing/serialization boundaries for the new block surface.
