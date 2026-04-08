CREATE TABLE "NoteCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "icon" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Note"
ADD COLUMN "categoryId" TEXT;

CREATE UNIQUE INDEX "NoteCategory_userId_name_key" ON "NoteCategory"("userId", "name");
CREATE INDEX "NoteCategory_userId_createdAt_idx" ON "NoteCategory"("userId", "createdAt");
CREATE INDEX "Note_categoryId_idx" ON "Note"("categoryId");

ALTER TABLE "NoteCategory"
ADD CONSTRAINT "NoteCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Note"
ADD CONSTRAINT "Note_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
