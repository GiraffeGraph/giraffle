# TASK-019 Search Workspace Filters And Quick Open Hardening

Status: Planned
Priority: P2
Updated: 2026-04-04

## Goal

Promote search from a helpful command palette to a real product surface.

## Scope

- Add a dedicated search workspace or overlay depth beyond the current quick-open list.
- Support filters such as notes, folders, tags, templates, and unresolved links.
- Improve result ranking and keyboard workflow.

## Acceptance

- Search supports more than simple title matching.
- Keyboard-first navigation remains fast and predictable.
- Search results can open the right workspace surface directly.
- Lint, typecheck, and build pass.

## Out of Scope

- Embedding-based semantic retrieval
- Cross-workspace federated search

## Likely Files

- `src/components/sidebar/CommandPalette.tsx`
- `src/components/sidebar/Sidebar.tsx`
- `src/domain/note/note.service.ts`
- `src/domain/link/link.service.ts`
- `src/app/(main)`

