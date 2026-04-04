# Graffle Roadmap

Updated: 2026-04-04

## Current Foundation

- Next.js 16 app shell, Prisma/PostgreSQL, NextAuth, and Tiptap are in place.
- Notes use a canonical block-oriented document model with stable block IDs and tree rehydration.
- Wikilink extraction, unresolved links, backlinks, template services, and folder services exist.
- Slash commands, template flows, folder navigation, publish/export, tags, graph, and deploy discipline are now present as first-pass foundations.
- Turkish product copy, a cleaner app shell, a Notion-like sidebar rail, context menus, command palette, theme switching, and first-pass block controls are now present.
- Current main gaps are note ordering, full folder and block drag-drop, rich table/media behavior, template management, stronger search, publish tree discipline, local-first boundaries, AI proposal workflows, and deeper production hardening.

## Ready

- `TASK-015` Note list ordering, pinning, and inbox flow
- `TASK-016` Folder drag-drop and reparenting
- `TASK-017` Block drag handles and contextual block menu
- `TASK-018` Rich table editing and media upload pipeline

## Planned

- `TASK-019` Search workspace, filters, and quick open hardening
- `TASK-020` Template library management and variable resolution
- `TASK-021` Graph workspace and backlink navigation hardening
- `TASK-022` Publish trees, slugs, and export packaging
- `TASK-023` Settings, theme, and workspace preferences
- `TASK-024` Auth production workflows and account management
- `TASK-025` Local-first operation log and sync boundary
- `TASK-026` AI proposal, approval, and patch application workflow
- `TASK-027` Production deploy hardening and observability

## Done

- Auth baseline with credentials and protected app routes
- Initial note, block, link, folder, and template domain boundaries
- Block-tree persistence with stable `blockId` and tree rehydration
- Patch-based block persistence diff for note saves
- Wikilink suggestions, note navigation, and create-from-link flow
- Visible slash command menu baseline
- Extended block surface for callout, toggle, image, and table scaffold flow
- Seeded templates and reusable template picker flow
- Explicit block mutation services for insert, update, move, and delete
- Folder tree navigation and persisted tag indexing
- Markdown and MDX export plus public publish path
- Graph view over persisted link projections
- Deploy container baseline and auth rate limiting hardening
- `TASK-010` Turkish product language and copy baseline
- `TASK-011` App shell visual refresh
- `TASK-012` Sidebar information architecture redesign
- `TASK-013` Context menus for note and sidebar surfaces
- `TASK-014` Note surface simplification and mobile polish
- Sidebar rail resizing, compact mode, and hover row actions
- First-pass folder ordering controls and editor block row controls

## Rules For Continuing

- Pick the top `Ready` task unless the user explicitly says otherwise.
- Update this file when a task changes status or a new follow-up task appears.
- Keep each implementation pass narrow enough to validate with lint, typecheck, and build when relevant.
