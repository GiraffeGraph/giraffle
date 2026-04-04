# TASK-007 Graph View Over Link Projections

Status: Done
Priority: P3
Updated: 2026-04-04

## Goal

Render a graph view on top of persisted link projections that already exist in the database.

## Scope

- Query nodes and edges from note and link tables.
- Render a simple graph surface for exploration.
- Keep data flow separate from heavy layout or animation experiments.

## Acceptance

- Graph view uses persisted link projections rather than note scans at render time.
- Graph interactions do not block note editing flows.
- Lint, typecheck, and build pass.

## Out of Scope

- Large-scale graph optimization
- Collaborative graph editing

## Likely Files

- `src/domain/link/`
- `src/server/api/notes.ts`
- `src/app/(main)/`
- `src/components/`

## Completed

- Added graph projection queries over persisted notes and links.
- Added a dedicated graph route and interactive SVG graph viewer.
- Kept graph reads separate from note editing and persistence paths.
