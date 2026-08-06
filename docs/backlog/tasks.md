# Giraffle Task Summary

Updated: 2026-04-07
Source: Consolidated from the former `docs/backlog/tasks/TASK-*.md` files.

## Roadmap Snapshot

- Giraffle already has its core stack in place: Next.js 16, Prisma/PostgreSQL, NextAuth, Tiptap, canonical block storage, wikilinks, backlinks, templates, folders, export, search, and deployment foundations.
- The roadmap marks `TASK-001` through `TASK-027` as completed.
- The product evolved in clear phases: data-model hardening, editor capabilities, navigation and information architecture, search, account and settings flows, local-first/sync boundaries, and production operations.
- The next layer is refinement work rather than missing platform basics: richer table UX, stronger template ergonomics, semantic search, and deeper local-first sync.

## Task Summaries

### TASK-001 — Patch-Based Note Mutations
- Replaced full-document note rewrites with block-level patch persistence.
- Preserved stable `blockId` values across common edits and moves.
- Kept parent-child ordering intact and made note saves cheaper and structurally safer.
- This became the persistence foundation for later explicit block mutation APIs.

### TASK-002 — Wikilink UX and Resolution Flow
- Turned wikilink indexing into an actual writing flow with `[[...]]` suggestions.
- Added navigation for resolved links and note creation for unresolved links.
- Connected link resolution directly to note creation so the index stays up to date.
- A separate unresolved-link review surface was left optional.

### TASK-003 — Extended Block Surface and Slash Commands
- Expanded the editor beyond the basic block set with callout, toggle, image, and table scaffolding.
- Extended slash commands so these block types can be inserted from the editor UI.
- Updated canonical block types and serialization boundaries so new blocks persist safely.
- Kept richer table behavior explicitly deferred until a later pass.

### TASK-004 — Seed Templates and Template Picker Flow
- Seeded practical starter templates for daily, meeting, and project notes.
- Added a template picker to note-creation flows in the sidebar and dashboard.
- Kept template application on the canonical note/block persistence path.
- Synced template-created notes with existing link and tag indexing flows.

### TASK-005 — Folder Tree and Tag Indexing
- Added visible hierarchical folder navigation to the app shell.
- Introduced note placement and folder move flows.
- Turned tags into a persisted, queryable domain instead of a schema-only idea.
- Added a basic tag-browsing surface without relying on render-time scans.

### TASK-006 — Markdown/MDX Export Pipeline
- Hardened Markdown parsing and serialization for supported block types.
- Added MDX-oriented downstream export output while keeping the AST as the source of truth.
- Added note-level Markdown and MDX export actions.

### TASK-008 — Deploy Discipline and Auth Hardening
- Added a production deployment baseline with Dockerfile, `.dockerignore`, and production compose setup.
- Documented environment and startup expectations in the repository.
- Hardened auth with secret checks, secure cookies, validation, and rate limiting.
- Closed the most obvious self-hosted production footguns without overbuilding identity features.

### TASK-009 — Explicit Block Mutation Service API
- Exposed canonical insert, update, move, and delete operations by `blockId`.
- Reused the patch-based persistence core instead of creating a second write path.
- Added service-level and server-action entry points for future editor and AI flows.
- Made block operations easier to call without embedding custom mutation logic in UI components.

### TASK-010 — Turkish Product Language and Copy Baseline
- Unified core product UI copy around a Turkish-first voice.
- Removed mixed English/Turkish labels across notes, templates, and auth pages.
- Aligned editor prompts, slash commands, wikilink prompts, and auth errors with the same product tone.
- Turned the app from a mixed-language prototype into a more coherent product experience.

### TASK-011 — App Shell Visual Refresh
- Reworked the authenticated shell into a cleaner, warmer, paper-like visual system.
- Improved shared spacing, surfaces, and control consistency across notes, auth, and templates.
- Reduced the “stitched together prototype” feel without changing the data model.
- Established a stronger base for later UI refinement work.

### TASK-012 — Sidebar Information Architecture Redesign
- Reorganized the sidebar into clearer navigation panels and hierarchy.
- Separated quick actions, overview, browse links, folders, tags, and recent notes.
- Reduced density and added stronger active-state and count cues.
- Turned the sidebar into a navigation system instead of a single crowded list.

### TASK-013 — Context Menus for Note and Sidebar Surfaces
- Added a reusable context-menu primitive with dismissal behavior.
- Enabled right-click menus on sidebar notes, sidebar folders, and the note header.
- Included visible fallback triggers for devices without right-click.
- Improved action discoverability without overloading main toolbars.

### TASK-014 — Note Surface Simplification and Mobile Polish
- Simplified the note page with calmer spacing and a clearer reading width.
- Reduced header clutter and improved metadata/backlink framing.
- Tightened mobile spacing and action density so smaller screens remain usable.
- Extended the polish into surrounding shell/editor surfaces for a more coherent workspace.

### TASK-015 — Note List Ordering and Pinning
- Added explicit note ordering instead of relying only on `updatedAt` sorting.
- Introduced persistent `position` and `isPinned` note flows.
- Added note-list surfaces and pin/move controls in note and sidebar workflows.
- Created a more stable workspace structure for folder and sidebar lists.

### TASK-016 — Folder Drag-Drop and Reparenting
- Replaced stepwise folder movement with real drag-drop interactions.
- Added persisted folder reordering and reparenting using `parentId` and `position`.
- Supported dropping under folders and reordering among siblings.
- Blocked invalid recursive nesting while keeping the tree state real, not UI-only.

### TASK-017 — Block Drag Handles and Contextual Block Menu
- Moved the editor closer to a block-based interaction model.
- Added draggable block handles with drop indicators.
- Added a contextual block menu for duplicate, transform, table edit, and delete actions.
- Kept all block actions on the canonical AST mutation path.

### TASK-018 — Rich Table Editing and Media Upload Pipeline
- Replaced table scaffolding with a real structured table node and editing boundary.
- Added a note-aware image upload path instead of relying only on raw URLs.
- Preserved honest serialization and persistence boundaries for both tables and images.
- Raised these blocks from MVP placeholders to practical note-editing features.

### TASK-019 — Search Workspace, Filters, and Quick Open Hardening
- Promoted search from a simple command palette into a real workspace surface.
- Added scope filters for different workspace entities.
- Expanded command palette routing and keyboard-first search workflows.
- Improved search depth without yet moving into semantic or cross-workspace retrieval.

### TASK-020 — Template Library Management and Variable Resolution
- Turned templates into a first-class workspace area instead of only a creation shortcut.
- Added create, update, and delete flows for templates.
- Added Markdown seed content and JSON-based variable editing.
- Kept template application producing canonical note documents.

### TASK-021 — Backlink Navigation Hardening
- Improved the connection between note pages and backlink navigation.
- Kept backlink data sourced from the persisted wikilink index.

### TASK-022 — Export Packaging
- Improved note export as a stable downstream model.
- Added cleaner Markdown/MDX packaging.
- Kept Markdown/MDX as downstream output rather than the primary source of truth.

### TASK-023 — Settings, Theme, and Workspace Preferences
- Centralized durable UI preferences into a dedicated settings surface.
- Added theme, sidebar, and workspace preference controls.
- Kept compatibility with lightweight local storage behavior.
- Made preference ownership clearer than scattered ad hoc toggles.

### TASK-024 — Auth Production Workflows and Account Management
- Extended auth from basic credentials protection to safer account-management flows.
- Added account page, password change, password reset request, token validation, and reset completion flows.
- Kept sensitive auth actions rate-limited and practical for self-hosted use.
- Avoided splitting auth into unnecessary external infrastructure.

### TASK-025 — Local-First Operation Log and Sync Boundary
- Created the first real boundary for future offline/local-first behavior.
- Added server-side operation-log persistence for note and folder changes.
- Added a client-side local sync queue boundary and related settings visibility.
- Kept PostgreSQL as current source of truth while leaving room for future sync evolution.

### TASK-026 — AI Proposal, Approval, and Patch Application Workflow
- Added the first explicit product boundary for AI-assisted note changes.
- Modeled AI changes as proposals rather than direct editor ownership.
- Added proposal pages plus create, apply, and reject actions.
- Enabled review-first patch workflows that still align with canonical block mutations.

### TASK-027 — Production Deploy Hardening and Observability
- Strengthened production startup and health discipline for self-hosted deployments.
- Added `/api/health` and container health checks.
- Updated production deployment documentation for realistic small-ops setups.
- Added basic observability hooks without expanding into heavyweight infrastructure.

## Overall Arc

1. **Core data integrity:** `TASK-001`, `TASK-003`, and `TASK-009` established a durable block-based document model.
2. **Linked-note workflows:** `TASK-002`, `TASK-005`, `TASK-006`, `TASK-019`, `TASK-021`, and `TASK-022` turned notes, links, tags, backlinks, search, and export into connected product features.
3. **UX and product polish:** `TASK-010` through `TASK-018` significantly improved language, shell quality, sidebar IA, note usability, block interaction, and media/table handling.
4. **Operational maturity:** `TASK-008`, `TASK-023`, `TASK-024`, `TASK-025`, `TASK-026`, and `TASK-027` pushed the app toward safer deployment, account management, settings, sync boundaries, and AI-assisted editing.

## Consolidation Note

The original per-task markdown files were collapsed into this single file to keep the backlog easier to scan and maintain.
