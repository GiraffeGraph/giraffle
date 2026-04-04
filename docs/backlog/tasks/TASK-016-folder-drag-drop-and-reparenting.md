# TASK-016 Folder Drag Drop And Reparenting

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Replace the current stepwise folder movement controls with real drag-drop and parent reassignment.

## Scope

- Add drag-drop ordering for sibling folders.
- Support moving folders under other folders where valid.
- Keep persistence grounded in `parentId` and `position`, not UI-only state.

## Acceptance

- Folder order persists after reload.
- Reparenting updates the actual tree, not just the current render.
- Invalid moves such as recursive nesting are blocked.
- Lint, typecheck, and build pass.

## Completed

- Added persisted folder relocate flow on top of `parentId` and `position`.
- Added sidebar drag-drop targets for reparenting under folders and reordering after siblings.

## Out of Scope

- Desktop-native multi-select drag behavior
- Cross-user concurrent reorder handling

## Likely Files

- `src/domain/folder/folder.service.ts`
- `src/server/api/folders.ts`
- `src/components/sidebar/Sidebar.tsx`
- `src/app/globals.css`
