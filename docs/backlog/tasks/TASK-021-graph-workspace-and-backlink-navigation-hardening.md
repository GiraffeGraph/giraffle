# TASK-021 Graph Workspace And Backlink Navigation Hardening

Status: Planned
Priority: P2
Updated: 2026-04-04

## Goal

Turn the graph and backlink views into a useful knowledge navigation surface rather than a baseline visualization.

## Scope

- Add graph focus, filtering, and neighbor exploration.
- Improve backlink navigation from note pages and graph nodes.
- Make unresolved and orphaned notes visible as navigable states.

## Acceptance

- Graph interactions help users navigate, not just look at nodes.
- Backlinks and graph drill-down feel connected.
- The data still comes from persisted link projections, not page-time rescans.
- Lint, typecheck, and build pass.

## Out of Scope

- 3D graph rendering
- Collaborative presence in graph views

## Likely Files

- `src/components/graph/GraphView.tsx`
- `src/server/api/graph.ts`
- `src/domain/link/link.service.ts`
- `src/components/notes/NoteEditorPage.tsx`

