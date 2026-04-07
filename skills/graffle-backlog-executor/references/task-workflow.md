# Giraffle Backlog Workflow

## Pick the Task

1. Open `/docs/backlog/roadmap.md`.
2. Find the highest-priority task marked `Ready`.
3. Open the matching file in `/docs/backlog/tasks/`.
4. Load extra repo context only for the chosen task.

## Execute the Task

- Confirm the smallest correct implementation slice.
- Reuse existing domain services and server actions before creating new entry points.
- Keep code paths coherent; avoid duplicate implementations for the same behavior.
- If the task becomes too large, stop and create a smaller follow-up task file.

## Update the Backlog

- Move the task to `In Progress` when implementation starts.
- Move the task to `Done` only after validation passes.
- Add a short dated note when you discover a new dependency or sharp edge.
- Add a new task file if the work exposes a new independent slice.

## Chain With Note Core Skill

Also load `../graffle-note-core/references/architecture.md` when the task touches:

- `src/domain/note/`
- `src/domain/link/`
- `src/domain/template/`
- `src/components/editor/`
- `src/server/api/notes.ts`
- `prisma/schema.prisma`
