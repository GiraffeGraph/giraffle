# TASK-015 Note List Ordering Pinning And Inbox Flow

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Stop treating every note list as purely `updatedAt`-sorted so Graffle can support a stable workspace structure.

## Scope

- Add explicit note ordering primitives for sidebar and folder note lists.
- Introduce pinned notes and a lightweight inbox/default placement flow.
- Preserve recent-note views as a projection instead of the only ordering model.

## Acceptance

- Notes can be reordered in at least one persistent list.
- Pinned notes remain stable across reloads.
- Sidebar and folder views do not fight each other over note ordering semantics.
- Lint, typecheck, and build pass.

## Completed

- Added persistent note `position`, `isPinned`, and `slug` flows to note services and server actions.
- Added inbox route and UI surfaces for root-level notes.
- Added pin and move controls to note and sidebar workflows.

## Out of Scope

- Full kanban or board views
- Multi-user shared ordering conflict resolution

## Likely Files

- `prisma/schema.prisma`
- `src/domain/note/note.service.ts`
- `src/server/api/notes.ts`
- `src/components/sidebar/Sidebar.tsx`
- `src/app/(main)/folders/[folderId]/page.tsx`
