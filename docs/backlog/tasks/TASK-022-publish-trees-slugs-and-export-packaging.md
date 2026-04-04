# TASK-022 Publish Trees Slugs And Export Packaging

Status: Planned
Priority: P2
Updated: 2026-04-04

## Goal

Move publish and export from first-pass note-level output to a cleaner downstream publishing model.

## Scope

- Add stable slugs and publish-tree decisions separate from note IDs.
- Support publishable hierarchy or collection-aware export packaging.
- Improve Markdown/MDX export outputs for downstream Git or file sync.

## Acceptance

- Public URLs do not depend only on internal note IDs.
- Export output is coherent enough for downstream mirroring.
- Publish behavior does not turn Markdown/MDX into the primary source of truth.
- Lint, typecheck, and build pass.

## Out of Scope

- Full static-site generator integration
- Multi-tenant public publishing controls

## Likely Files

- `prisma/schema.prisma`
- `src/domain/note/note.export.ts`
- `src/domain/note/note.service.ts`
- `src/server/api/notes.ts`
- `src/app/p/[noteId]`

