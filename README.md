# Giraffle

Giraffle is a block-based knowledge editor that combines:

- Notion-like block editing
- Obsidian-like wikilinks and backlinks
- PostgreSQL-backed canonical note storage
- Markdown and MDX as derived export formats
- self-hosted deployment discipline

## Current Foundation

- Tiptap editor with custom `callout`, `toggle`, `wikilink`, `image`, and slash-command support
- Canonical AST persistence into `Note` and `Block` tables
- Patch-aware note saves plus explicit block mutation service APIs
- Persisted wikilink index, backlinks, unresolved links, and graph projection
- Tag extraction and persistence into `Tag` and `NoteTag`
- Seeded daily, meeting, and project templates with variable filling
- Folder navigation, note move flow, publish toggle, Markdown/MDX export, and public note pages

## Architecture

- Editor engine: Tiptap
- Canonical source of truth: block AST JSON
- Derived formats: Markdown and MDX
- Database: PostgreSQL via Prisma
- Framework: Next.js App Router with TypeScript

## Core Domains

| Domain | Responsibility |
| --- | --- |
| Note | metadata, canonical document, publish state |
| Block | stable block IDs, ordering, parent-child nesting |
| Link | wikilinks, resolved note targets, backlinks, graph edges |
| Tag | extracted note tags with indexed browsing |
| Template | seeded and custom note starters |
| Folder | hierarchical organization and publish path segments |

## Local Development

### Prerequisites

- Node.js 20+
- Docker

### Setup

```bash
npm install
docker compose up -d
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Set `AUTH_SECRET` in `.env` to a long random value before logging in.

## Routes

- `/dashboard` workspace overview
- `/notes/[noteId]` editable note view
- `/folders/[folderId]` folder-scoped note listing
- `/tags/[tagName]` indexed tag browsing
- `/graph` link graph over persisted projections
- `/inbox` default landing area for notes without folders
- `/search` filterable workspace search
- `/templates` template library management
- `/publish` publish/export workspace
- `/proposals` review-first proposal queue
- `/settings` theme, sidebar, and local sync preferences
- `/account` account and password maintenance
- `/p/[noteId]` public published note surface
- `/published/[...slugParts]` slug-based public published route

## Export And Publish

- Notes stay canonical in block AST form.
- Markdown and MDX are derived through `src/domain/note/note.serializer.ts` and `src/domain/note/note.export.ts`.
- Publish file paths are derived from folder lineage plus slugified note titles.

## Production Deployment

### Container Build

```bash
cp .env.production.example .env.production
$EDITOR .env.production
./scripts/prod-up.sh
```

The production container:

- builds Next.js in `standalone` mode
- runs `prisma migrate deploy` on startup
- starts the Next.js server behind nginx
- exposes the app on port `80`
- exposes `/api/health` for container health checks
- persists PostgreSQL data in `giraffle_pgdata`
- persists uploaded images in `giraffle_uploads`

### Required Environment Variables

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXTAUTH_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`

### Server Steps

```bash
git clone <your-repo-url> giraffle
cd giraffle
cp .env.production.example .env.production
$EDITOR .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Useful commands:

```bash
./scripts/prod-logs.sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml restart app
```

`NEXTAUTH_URL` must point to the public URL you will actually use, for example `http://203.0.113.10` or `https://notes.example.com`.

## Auth Baseline

- credential login with bcrypt password hashes
- production secret requirement
- secure cookies in production
- basic login and registration rate limiting

## Project Structure

```text
src/
  app/
  components/
    editor/
    graph/
    notes/
    sidebar/
    templates/
  domain/
    folder/
    link/
    note/
    tag/
    template/
  lib/
  server/
```
