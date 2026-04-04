# TASK-006 Markdown MDX Export And Publish Pipeline

Status: Done
Priority: P2
Updated: 2026-04-04

## Goal

Turn the current serializer boundary into a reliable export and publish pipeline without changing the canonical storage model.

## Scope

- Harden Markdown serialization and parsing for supported block types.
- Add MDX-oriented downstream export shape.
- Define a publishable note tree path and file naming strategy.

## Acceptance

- Export is possible without treating Markdown or MDX as source of truth.
- Publishable notes can be derived from persisted note and block data.
- Lint, typecheck, and build pass.

## Out of Scope

- Git sync engine
- External CMS integration

## Likely Files

- `src/domain/note/note.serializer.ts`
- `src/domain/note/note.service.ts`
- `src/domain/link/`
- `src/server/api/notes.ts`

## Completed

- Hardened Markdown parsing and serialization for the supported block surface including callouts, toggles, and images.
- Added MDX-oriented export artifacts with folder-derived publish file paths.
- Added note export actions, publish toggles, and public published note pages while keeping block AST as the source of truth.
