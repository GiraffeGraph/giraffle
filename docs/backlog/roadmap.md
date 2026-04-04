# Graffle Roadmap

Updated: 2026-04-04

## Current Foundation

- Next.js 16 app shell, Prisma/PostgreSQL, NextAuth, and Tiptap are in place.
- Notes use a canonical block-oriented document model with stable block IDs and tree rehydration.
- Wikilink extraction, unresolved links, backlinks, template services, and folder services exist.
- Slash commands, template flows, folder navigation, publish/export, tags, graph, and deploy discipline are now present as first-pass foundations.
- Frontend shell quality is still first-pass: product copy is mixed-language, sidebar hierarchy is weak, and context-menu interactions do not exist yet.

## Ready

- `TASK-013` Context menus for note and sidebar surfaces

## Planned

- `TASK-014` Note surface simplification and mobile polish
- Follow-up hardening for rich table editing
- Template sharing and advanced variable resolution
- Stronger auth workflows such as reset/invite/email verification
- Export packaging and Git downstream mirroring

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

## Rules For Continuing

- Pick the top `Ready` task unless the user explicitly says otherwise.
- Update this file when a task changes status or a new follow-up task appears.
- Keep each implementation pass narrow enough to validate with lint, typecheck, and build when relevant.
