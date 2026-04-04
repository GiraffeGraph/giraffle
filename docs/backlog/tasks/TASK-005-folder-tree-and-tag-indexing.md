# TASK-005 Folder Tree And Tag Indexing

Status: Done
Priority: P2
Updated: 2026-04-04

## Goal

Expose hierarchical folder navigation and make tags a real indexed domain instead of schema-only capacity.

## Scope

- Render folder tree navigation in the app shell.
- Add note placement and folder move flows.
- Extract and persist tags cleanly.
- Add at least one small tag browsing surface.

## Acceptance

- Folder tree is visible and navigable.
- Tags are persisted and queryable without render-time scans.
- Lint, typecheck, and build pass.

## Out of Scope

- Complex workspace permissions
- Large taxonomy management UI

## Likely Files

- `src/domain/folder/`
- `src/domain/note/`
- `src/components/sidebar/Sidebar.tsx`
- `src/server/api/folders.ts`
- `prisma/schema.prisma`

## Completed

- Added folder tree navigation to the app shell and folder-scoped note pages.
- Added note folder move flow from the note header.
- Introduced tag extraction, persistence, and tag browsing pages without render-time note scans.
