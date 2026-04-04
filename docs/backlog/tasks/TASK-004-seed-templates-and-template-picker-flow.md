# TASK-004 Seed Templates And Template Picker Flow

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Make templates visible and useful through seeded defaults and a note creation flow that can apply them.

## Scope

- Seed daily, meeting, and project templates.
- Add a picker in the note creation flow.
- Support basic variable filling where the current template model already allows it.

## Acceptance

- Fresh environments can create useful notes from seeded templates.
- Template application stays on the canonical block persistence path.
- The UI can choose a template before creating a note.
- Lint, typecheck, and build pass.

## Out of Scope

- Advanced template marketplace or sharing
- Complex nested conditional template logic

## Likely Files

- `src/domain/template/template.service.ts`
- `src/server/api/templates.ts`
- `src/components/sidebar/Sidebar.tsx`
- `src/app/(main)/dashboard/page.tsx`
- `prisma/`

## Completed

- Seeded daily, meeting, and project templates through the template domain service.
- Added a reusable template picker UI in the sidebar and dashboard flows.
- Kept template application on the canonical block persistence path and synchronized link plus tag indexing after note creation.
