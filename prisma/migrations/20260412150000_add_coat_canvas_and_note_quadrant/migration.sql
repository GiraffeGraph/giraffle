-- AlterTable: Add quadrant to Note
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "quadrant" TEXT;

-- CreateIndex for quadrant
CREATE INDEX IF NOT EXISTS "Note_quadrant_idx" ON "Note"("quadrant");

-- CreateTable: CoatCanvas
CREATE TABLE IF NOT EXISTS "CoatCanvas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Yeni Canvas',
    "columns" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoatCanvas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CoatCell
CREATE TABLE IF NOT EXISTS "CoatCell" (
    "id" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "colSpan" INTEGER NOT NULL DEFAULT 4,
    "rowSpan" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoatCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoatCanvas_userId_idx" ON "CoatCanvas"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoatCell_canvasId_idx" ON "CoatCell"("canvasId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoatCell_canvasId_position_idx" ON "CoatCell"("canvasId", "position");

-- AddForeignKey
ALTER TABLE "CoatCanvas" ADD CONSTRAINT "CoatCanvas_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoatCell" ADD CONSTRAINT "CoatCell_canvasId_fkey"
  FOREIGN KEY ("canvasId") REFERENCES "CoatCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

