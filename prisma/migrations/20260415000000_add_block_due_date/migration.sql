-- AlterTable
ALTER TABLE "Block" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Block_dueDate_idx" ON "Block"("dueDate");
