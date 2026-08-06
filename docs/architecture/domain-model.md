# Domain Model Before Native Clients

Status: **Accepted**

This boundary is the contract for the web app and the future encrypted local database.

## Page and block

`Note` is the persisted page aggregate used by the product's Notes surface. A page owns an ordered block tree. Folders organize pages but do not own content or tasks.

`page.service.ts` owns page metadata, block-tree persistence, archive/export, and placement. Task behavior is intentionally absent from this service.

## Tasks

A `taskItem` block is the content anchor. Its stable block ID is the task ID exposed to clients.

`TaskMetadata` is the canonical structured task projection:

- completion
- task priority
- due date
- duration
- description

`task.service.ts` owns task mutations and Stride/Tower queries. Editor-compatible `checked` block attributes are updated transactionally, but scheduling and priority no longer live in arbitrary JSON attributes.

`PagePriority` stores the Tower placement of a page. It is deliberately separate from `TaskMetadata.priority`; page focus and task priority are different concepts.

## Trek boards

A `Board` is not a special Note. It owns relational `BoardColumn` records and belongs to a relational `BoardStatus` lane. `BoardTask` links a board/column position to a canonical task block.

A board has a private `taskSourceNote` solely to host canonical task blocks in the current Tiptap block model. It is excluded from Notes, folders, search, archive, wikilink discovery, and Savanna. The Board owns its product identity, title, icon, status, columns, and placement.

This keeps one task visible through three lenses:

- Trek: board and column placement
- Stride: `TaskMetadata.dueDate`
- Tower: `TaskMetadata.priority`

## Savanna

`Canvas.elements` remains the canonical Excalidraw scene. `CanvasReference` is a relational projection from a stable Excalidraw element ID to a Note ID.

Every canvas save rebuilds references transactionally with the scene update. References support integrity checks, note deletion cleanup, backlinks, and future sync indexing without treating links parsed from JSON as authoritative relational state.

## Native mapping

The native SQLCipher schema should preserve these stable identities and boundaries. JSON/CBOR remains appropriate for rich block and Excalidraw payloads; ownership, references, ordering, task metadata, and board placement remain explicit relational records.
