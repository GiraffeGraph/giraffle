---
name: graffle-backlog-executor
description: Continue Giraffle work from the repository backlog with small, reviewable implementation slices. Use when choosing the next ready task, reading the task brief, executing it safely, updating task status, splitting oversized work into new tasks, and leaving validation results in the repo. Prefer this skill whenever the user asks to continue from where previous Giraffle work stopped.
---

# Giraffle Backlog Executor

Read `references/task-workflow.md` first.

Then read `/docs/backlog/roadmap.md`. Pick the highest-priority task marked `Ready`, unless the user explicitly names a different task.

## Execution Rules

- Read the chosen `/docs/backlog/tasks/*.md` file before editing code.
- If the chosen task touches note, editor, link, template, or serializer code, also read `../graffle-note-core/references/architecture.md`.
- Keep the implementation slice small enough to finish with validation in one pass.
- Split broad work into a new task file instead of hiding scope growth inside one big diff.
- Update backlog status and follow-up notes before ending the turn.

## Task Status Rules

- `Ready`: scoped and unblocked.
- `In Progress`: currently being implemented.
- `Blocked`: needs infrastructure, product clarification, or another task first.
- `Done`: implemented and validated.

## Required Validation

- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run `npm run build` for tasks that affect routing, editor wiring, persistence, auth, or build-time code paths.

## Completion Output

- Update the task file with what changed and any new sharp edges.
- Update `/docs/backlog/roadmap.md` to reflect the new status.
- Call out any new follow-up task created during the work.
