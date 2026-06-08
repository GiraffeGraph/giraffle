-- Trek rework: a Kanban board is now a Note (note.kanbanColumns holds the
-- column defs; cards are the note's taskItem blocks). Drop the standalone
-- Kanban* tables introduced in 20260608000000_add_kanban_trek.
-- Additive note column; does NOT touch Note.searchVector (FTS).

-- AlterTable
ALTER TABLE "Note" ADD COLUMN "kanbanColumns" JSONB;

-- DropTable (child-first to respect FKs)
DROP TABLE IF EXISTS "KanbanCard";
DROP TABLE IF EXISTS "KanbanColumn";
DROP TABLE IF EXISTS "KanbanBoard";
