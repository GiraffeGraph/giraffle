---
name: giraffle-note-core
description: Continue implementation of Giraffle's note and editor core in the giraffle repository. Use when changing canonical block persistence, Tiptap extensions, slash commands, wikilinks, link indexing, backlinks, templates, folder placement, markdown or MDX serialization boundaries, or note navigation. Prefer this skill for work touching src/domain/note, src/domain/link, src/domain/template, src/components/editor, Prisma note models, or related server actions.
---

# Giraffle Note Core

Read `references/architecture.md` before changing note or editor code.

If the work is backlog-driven, read `/docs/backlog/roadmap.md` and the chosen `/docs/backlog/tasks/*.md` file before editing.

## Core Rules

- Treat the Tiptap document and block AST as canonical state.
- Keep Markdown and MDX as derived outputs, never the primary transaction store.
- Preserve stable block IDs and parent or child structure.
- Index wikilinks on writes, not on page render.
- Keep templates as a separate domain, not editor-only UI state.
- Prefer small, reviewable changes over placeholder-heavy rewrites.
- Do not introduce realtime collaboration, microservices, or a fake plugin system.

## Working Sequence

1. Inspect the touched domain and UI files before editing.
2. Reuse existing services, server actions, and Prisma models where possible.
3. Keep data transforms in domain modules, not inside React components.
4. Validate the affected save, load, and projection paths after editing.
5. Update `/docs/backlog/roadmap.md` if the task status or follow-up list changes.

## Validation

- Run `npm run lint`.
- Run `npx tsc --noEmit`.
- Run `npm run build` when routes, editor wiring, auth, Prisma integration, or serialization paths change.

## Hotspots

- `src/domain/note/`
- `src/domain/link/`
- `src/domain/template/`
- `src/components/editor/`
- `src/server/api/notes.ts`
- `prisma/schema.prisma`
