# TASK-002 Wikilink UX And Resolution Flow

Status: Done
Priority: P0
Updated: 2026-04-04

## Goal

Turn persisted wikilink indexing into a usable product flow with autocomplete, note navigation, and unresolved-link actions.

## Scope

- Add note suggestions while writing `[[...]]`.
- Navigate resolved wikilinks by `noteId` when available.
- Support unresolved link creation into a new note.
- Expose unresolved links in a small review surface if needed.

## Acceptance

- Typing a wikilink can surface matching notes.
- Clicking a resolved wikilink opens the target note.
- An unresolved wikilink can create a note and resolve the link index.
- Lint, typecheck, and build pass.

## Out of Scope

- Full graph visualization
- Rich mention system beyond note links

## Likely Files

- `src/components/editor/extensions/wikilink.ts`
- `src/components/editor/Editor.tsx`
- `src/domain/link/link.service.ts`
- `src/server/api/notes.ts`
- `src/app/(main)/notes/[noteId]/page.tsx`

## Completed

- Typing `[[` now opens note suggestions while editing.
- Existing note suggestions insert resolved wikilinks with `noteId` metadata.
- Clicking a resolved wikilink navigates to the target note.
- Clicking an unresolved wikilink can create the note after confirmation.
- Validation passed with lint, typecheck, and production build.

## Deferred

- Dedicated unresolved-link review surface remains optional and is not yet built.
