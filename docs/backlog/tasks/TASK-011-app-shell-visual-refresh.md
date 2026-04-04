# TASK-011 App Shell Visual Refresh

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Replace the current visually noisy, uneven shell with a cleaner and more intentional product UI.

## Scope

- Refine design tokens, spacing, section rhythm, and surface hierarchy.
- Improve dashboard, note page, template modal, and graph page visual consistency.
- Remove the current "prototype stitched together" feeling.

## Acceptance

- The authenticated shell has a coherent visual language.
- Shared controls feel consistent across pages.
- The design is cleaner without becoming generic or flat.
- Lint, typecheck, and build pass.

## Out of Scope

- Full custom illustration system
- Public marketing site redesign

## Likely Files

- `src/app/globals.css`
- `src/app/(main)/layout.tsx`
- `src/app/(main)/dashboard/page.tsx`
- `src/components/notes/NoteEditorPage.tsx`
- `src/components/templates/TemplatePicker.tsx`
- `src/components/graph/GraphView.tsx`

## Completed

- The authenticated shell moved from a dark prototype look to a warmer paper-like visual system with shared surface, spacing, and control rules.
- Dashboard, note, graph, auth, publish, and template flows now share the same card language and action styling.
- Sidebar branding, hero surfaces, editor shell, and graph panels were refreshed without changing the core data model.
- Lint, typecheck, and production build passed after the visual refresh.
