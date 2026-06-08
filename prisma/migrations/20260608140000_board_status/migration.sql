-- Trek board-of-boards: per-user meta status columns + each board's placement.
-- Additive; does NOT touch Note.searchVector (FTS).

ALTER TABLE "User" ADD COLUMN "boardColumns" JSONB;
ALTER TABLE "Note" ADD COLUMN "kanbanStatus" TEXT;
ALTER TABLE "Note" ADD COLUMN "kanbanStatusPosition" INTEGER;
