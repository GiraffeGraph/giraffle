# TASK-014 Note Surface Simplification And Mobile Polish

Status: Done
Priority: P2
Updated: 2026-04-04

## Goal

Make the note page calmer, easier to read, and more usable on smaller screens.

## Scope

- Reduce toolbar clutter in the note header.
- Improve note metadata, backlinks, and editor framing.
- Tighten mobile spacing and action access.

## Acceptance

- The note page feels less crowded.
- Mobile layouts remain usable without losing key actions.
- Lint, typecheck, and build pass.

## Out of Scope

- Full offline mobile app behavior
- Tablet-specific editor gestures

## Likely Files

- `src/components/notes/NoteEditorPage.tsx`
- `src/components/editor/Editor.tsx`
- `src/app/globals.css`

## Completed

- Simplified the note shell with calmer spacing, breadcrumb treatment, and a more page-like reading width.
- Tightened mobile spacing and action density so the note page stays usable on smaller screens.
- Continued the pass into sidebar and editor polish so the shell now feels closer to a coherent workspace.
