---
name: graffle-frontend-ux
description: Continue Giraffle frontend localization and product-surface work in the giraffle repository. Use when changing Turkish product copy, visual design tokens, layout hierarchy, sidebar information architecture, note page UX, menus, context menus, responsive behavior, or shared interaction patterns. Prefer this skill for work touching src/app/globals.css, src/components/sidebar, src/components/notes, src/components/templates, src/components/graph, dashboard routes, or authenticated app-shell surfaces.
---

# Giraffle Frontend UX

Read `references/frontend-principles.md` before editing product-facing UI.

If the work is backlog-driven, read `/docs/backlog/roadmap.md` and the chosen `/docs/backlog/tasks/*.md` file before editing.

## Core Rules

- Make the product language Turkish-first across user-facing app surfaces.
- Keep domain logic in server actions and domain modules, not inside presentation-only components.
- Reduce clutter before adding UI chrome; prefer fewer clearer actions.
- Use context menus for secondary actions and keep a visible click fallback for touch.
- Preserve a coherent visual language across sidebar, dashboard, note page, graph, and dialogs.
- Avoid emoji-heavy UI and corrupted glyphs in product surfaces.
- Keep responsive behavior usable on mobile and desktop.

## Working Sequence

1. Inspect the current surface before redesigning it.
2. Identify the primary action, secondary actions, and destructive actions for that surface.
3. Move secondary or destructive actions into menus or context menus instead of stacking buttons.
4. Unify labels, spacing, states, and interaction feedback across touched components.
5. Validate navigation, hover, focus, empty, loading, and context-menu states after editing.

## Validation

- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run `npm run build` when changing routes, app shell, global CSS, shared UI patterns, or menus.

## Hotspots

- `src/app/globals.css`
- `src/components/sidebar/Sidebar.tsx`
- `src/components/notes/NoteEditorPage.tsx`
- `src/components/templates/TemplatePicker.tsx`
- `src/components/graph/GraphView.tsx`
- `src/app/(main)/dashboard/page.tsx`
- `src/app/(main)/layout.tsx`
