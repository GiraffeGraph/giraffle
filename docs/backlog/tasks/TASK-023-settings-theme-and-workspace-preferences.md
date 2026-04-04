# TASK-023 Settings Theme And Workspace Preferences

Status: Done
Priority: P3
Updated: 2026-04-04

## Goal

Centralize user-facing workspace preferences instead of scattering them across local UI entry points.

## Scope

- Add a settings surface for theme, sidebar behavior, and workspace preferences.
- Move durable UI preferences toward a clearer home.
- Keep current lightweight local storage behavior compatible while the product is still single-user oriented.

## Acceptance

- Users can discover and change theme or workspace behavior from a dedicated surface.
- Preference ownership is clearer than ad hoc UI toggles.
- Existing preferences are not silently lost.
- Lint, typecheck, and build pass.

## Completed

- Added settings surface for theme, sidebar preferences, and local sync queue visibility.

## Out of Scope

- Full org-level policy management
- Billing or plan settings

## Likely Files

- `src/components/theme/theme-config.ts`
- `src/components/sidebar/Sidebar.tsx`
- `src/app/(main)`
- `src/app/globals.css`
