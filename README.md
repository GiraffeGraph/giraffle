# Graffle 🦒

A block-based knowledge editor with linked notes, wikilinks, and graph structure.

Graffle combines Notion-like block editing with Obsidian-like linked knowledge, built for local-first architecture and future AI agent integration.

## Architecture

- **Editor**: Tiptap (ProseMirror) with custom wikilink mark + slash commands
- **Canonical data**: Block/AST JSON (Tiptap document format)
- **Markdown/MDX**: Derived file representation, not primary source of truth
- **Database**: PostgreSQL via Prisma 7 with pg adapter
- **Framework**: Next.js 16 (App Router) + React + TypeScript

## Domain Model

| Entity    | Purpose |
|-----------|---------|
| Note      | Primary document unit |
| Block     | Content node within a note (paragraph, heading, list, etc.) |
| Link      | Wikilink/URL connection between notes |
| Tag       | Note-level labels |
| Template  | Reusable note structures with variable support |
| Folder    | Hierarchical organization |

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL)

### Setup

```bash
# Clone and install
git clone https://github.com/GiraffeGraph/giraffle.git
cd giraffle
npm install

# Start PostgreSQL
docker compose up -d

# Create .env file
cp .env.example .env

# Set a strong auth secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Paste the generated value into AUTH_SECRET in .env

# Run migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start.

## Project Structure

```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── editor/       # Tiptap editor shell + extensions
│   ├── notes/        # Note display components
│   └── sidebar/      # Navigation sidebar
├── domain/           # Business logic (pure domain layer)
│   ├── note/         # Note & Block types, service, serializer
│   ├── link/         # Wikilink parser, link indexing, backlinks
│   ├── template/     # Template types & application
│   └── folder/       # Folder hierarchy
├── lib/              # Shared utilities (DB client, helpers)
└── server/           # Server actions (API layer)
```

## Key Design Decisions

- **AST is canonical**: Editor content is stored as block JSON, not Markdown
- **Links are indexed**: Wikilinks are extracted and persisted on save, not computed at render
- **Templates are a domain**: Not editor hacks — separate entity with variable support
- **Backlinks are pre-computed**: Queried from Link table, not full-text scanned
- **Markdown is derived**: `blocksToMarkdown()` / `markdownToBlocks()` for export/import

## License

MIT
