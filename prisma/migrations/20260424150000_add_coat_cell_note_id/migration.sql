-- AlterTable
ALTER TABLE "CoatCell" ADD COLUMN "noteId" TEXT;

-- AddForeignKey
ALTER TABLE "CoatCell" ADD CONSTRAINT "CoatCell_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CoatCell_noteId_idx" ON "CoatCell"("noteId");
