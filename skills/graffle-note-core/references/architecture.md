# Giraffle Note Core Architecture

## Current Foundation

- Next.js 16 App Router shell with NextAuth, Prisma, PostgreSQL, and Tiptap.
- Canonical note content stored as block-oriented Tiptap JSON and persisted as block rows.
- Stable `blockId` assignment in the editor plus tree rehydration on note load.
- Wikilink extraction, unresolved link storage, backlink reads, and template domain services.
- Markdown parser and serializer boundary exists, but is still MVP-level.

## Canonical Decisions

- Tiptap remains the editor engine unless the repository grows a stronger existing alternative.
- The editor source of truth is block or AST data, not Markdown or MDX.
- Markdown and MDX are downstream representations for export, publish, and sync.
- Backlinks and graph edges come from persisted link projections, not render-time scans.
- Templates remain a first-class domain with variables and application flow.

## Key Repo Files

- `src/domain/note/note.service.ts`
  Owns note create, load, save, archive, and delete flows.
- `src/domain/note/block-tree.ts`
  Owns document-to-block flattening and block-to-document rehydration.
- `src/domain/link/link.service.ts`
  Owns extraction, link persistence, backlinks, and unresolved link reads.
- `src/domain/template/template.service.ts`
  Owns template reads, creation, variable resolution, and note application flow.
- `src/components/editor/Editor.tsx`
  Owns Tiptap wiring, autosave handoff, block IDs, and slash menu rendering.
- `src/components/editor/extensions/`
  Owns editor behavior such as wikilinks, slash commands, and block ID assignment.

## Active Gaps

- Saves still rewrite the full note document instead of applying block-level mutations.
- Wikilink UX is indexed but not yet productized with autocomplete, create-from-link, or reliable note navigation.
- The editor supports only a small MVP block surface.
- Template services exist but seed templates and picker UI do not.
- Export and publish paths are architectural placeholders, not production flows.

## Guardrails

- Do not push core logic down into UI-only components.
- Do not bypass domain services with ad hoc DB writes in pages or components.
- Do not make Markdown the source of truth as a shortcut for export work.
- Prefer adding one correct path and reusing it everywhere over parallel implementations.
