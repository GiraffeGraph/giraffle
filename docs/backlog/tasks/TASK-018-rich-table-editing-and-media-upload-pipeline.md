# TASK-018 Rich Table Editing And Media Upload Pipeline

Status: Ready
Priority: P1
Updated: 2026-04-04

## Goal

Turn the current table and image surface from scaffold-level support into a realistic note-editing feature.

## Scope

- Replace the current table placeholder path with a real structured table block/editor behavior.
- Add an image upload boundary instead of relying only on raw URLs.
- Keep Markdown/MDX export and persistence boundaries honest for both block types.

## Acceptance

- Tables can be created and edited in a structurally valid way.
- Images have a clear upload or storage path rather than only pasted URLs.
- Serialization and persistence do not break the canonical AST model.
- Lint, typecheck, and build pass.

## Out of Scope

- Full spreadsheet-grade formulas
- Video and file-attachment suites in the same pass

## Likely Files

- `src/components/editor/Editor.tsx`
- `src/components/editor/extensions`
- `src/domain/note/note.types.ts`
- `src/domain/note/block-tree.ts`
- `src/domain/note/note.serializer.ts`
- `src/server/api/notes.ts`

