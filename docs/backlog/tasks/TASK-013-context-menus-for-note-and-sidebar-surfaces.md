# TASK-013 Context Menus For Note And Sidebar Surfaces

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Add proper right-click interaction to key Graffle surfaces so actions are discoverable without crowding the main UI.

## Scope

- Introduce a reusable context-menu primitive.
- Support right-click menus on sidebar note items, sidebar folder items, and the note page header.
- Include a visible fallback trigger for touch and non-right-click devices.

## Acceptance

- Right-click works on both note and sidebar surfaces.
- Menus expose relevant actions without duplicating the whole toolbar.
- Keyboard and outside-click dismissal work reliably.
- Lint, typecheck, and build pass.

## Out of Scope

- Full desktop-grade menu nesting
- Block-level editor context menus in the same pass

## Likely Files

- `src/components/sidebar/Sidebar.tsx`
- `src/components/notes/NoteEditorPage.tsx`
- `src/app/globals.css`
- `src/server/api/notes.ts`
- `src/server/api/folders.ts`

## Completed

- Added a reusable context menu primitive with outside-click and keyboard dismissal.
- Wired right-click and visible trigger menus into sidebar note rows, sidebar folder rows, and note-level actions.
- Kept actions discoverable without duplicating the full toolbar surface.
