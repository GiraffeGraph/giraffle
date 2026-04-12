-- CreateTable
CREATE TABLE "WorkspaceFeed" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFeedSource" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "folderId" TEXT,
    "noteId" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceFeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFeedItem" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "sourceUrl" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceFeed_userId_idx" ON "WorkspaceFeed"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceFeedSource_feedId_idx" ON "WorkspaceFeedSource"("feedId");

-- CreateIndex
CREATE INDEX "WorkspaceFeedSource_folderId_idx" ON "WorkspaceFeedSource"("folderId");

-- CreateIndex
CREATE INDEX "WorkspaceFeedSource_noteId_idx" ON "WorkspaceFeedSource"("noteId");

-- CreateIndex
CREATE INDEX "WorkspaceFeedSource_categoryId_idx" ON "WorkspaceFeedSource"("categoryId");

-- CreateIndex
CREATE INDEX "WorkspaceFeedItem_feedId_createdAt_idx" ON "WorkspaceFeedItem"("feedId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceFeedItem_feedId_position_idx" ON "WorkspaceFeedItem"("feedId", "position");

-- AddForeignKey
ALTER TABLE "WorkspaceFeed" ADD CONSTRAINT "WorkspaceFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFeedSource" ADD CONSTRAINT "WorkspaceFeedSource_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "WorkspaceFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFeedSource" ADD CONSTRAINT "WorkspaceFeedSource_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFeedSource" ADD CONSTRAINT "WorkspaceFeedSource_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFeedSource" ADD CONSTRAINT "WorkspaceFeedSource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "NoteCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFeedItem" ADD CONSTRAINT "WorkspaceFeedItem_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "WorkspaceFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
