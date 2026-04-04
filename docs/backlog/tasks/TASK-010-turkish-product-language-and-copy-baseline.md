# TASK-010 Turkish Product Language And Copy Baseline

Status: Done
Priority: P1
Updated: 2026-04-04

## Goal

Make Graffle feel like a Turkish-first product instead of a mixed-language prototype.

## Scope

- Translate authenticated app surfaces to Turkish.
- Unify repeated product terms across sidebar, dashboard, note page, graph, template flows, and auth pages.
- Remove visibly broken or low-quality UI copy.

## Acceptance

- Core app surfaces no longer mix English and Turkish arbitrarily.
- Empty states, buttons, section labels, and helper copy read like one product.
- Lint, typecheck, and build pass.

## Out of Scope

- Full i18n framework or locale switching
- Marketing site copy

## Likely Files

- `src/components/sidebar/Sidebar.tsx`
- `src/components/notes/NoteEditorPage.tsx`
- `src/components/templates/TemplatePicker.tsx`
- `src/components/graph/GraphView.tsx`
- `src/app/(main)/dashboard/page.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`

## Completed

- Core authenticated surfaces now use Turkish-first product copy.
- Dashboard, folder, tag, note, graph, template, publish, and auth pages no longer mix English and Turkish UI labels.
- Editor placeholder, slash commands, wikilink prompts, and auth errors were aligned with the same product voice.
- Lint, typecheck, and production build passed after the copy baseline pass.
