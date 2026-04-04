# TASK-026 AI Proposal Approval And Patch Application Workflow

Status: Done
Priority: P2
Updated: 2026-04-04

## Goal

Add the first explicit product boundary for AI-assisted note changes without letting agents own editor state directly.

## Scope

- Model proposals or patches as reviewable units separate from direct editor ownership.
- Support small patch application against canonical block IDs.
- Leave room for approval, rejection, and partial apply flows.

## Acceptance

- AI changes can be represented without bypassing the note mutation model.
- Proposals are distinguishable from already-applied content.
- The design supports both tiny edits and larger review-first changes.
- Lint, typecheck, and build pass.

## Completed

- Added proposal domain, proposal pages, create/apply/reject actions, and note-level review UI.

## Out of Scope

- Autonomous long-running agent orchestration
- Full conversation memory or embedding pipelines in the same pass

## Likely Files

- `src/domain/note`
- `src/server/api/notes.ts`
- `src/components/notes`
- `src/app/(main)`
