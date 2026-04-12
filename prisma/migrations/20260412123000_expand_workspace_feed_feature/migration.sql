-- AlterTable
ALTER TABLE "WorkspaceFeed"
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'news',
ADD COLUMN     "refreshIntervalHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'mixed',
ADD COLUMN     "queryMode" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN     "queryOverride" TEXT,
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showOnDashboard" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastRefreshedAt" TIMESTAMP(3),
ADD COLUMN     "nextRefreshAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkspaceFeedSource"
ADD COLUMN     "includeChildren" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WorkspaceFeedItem"
ADD COLUMN     "itemType" TEXT NOT NULL DEFAULT 'entry',
ADD COLUMN     "whyRelevant" TEXT,
ADD COLUMN     "sourceName" TEXT,
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorkspaceFeed_userId_kind_idx" ON "WorkspaceFeed"("userId", "kind");

-- CreateIndex
CREATE INDEX "WorkspaceFeed_userId_isEnabled_nextRefreshAt_idx" ON "WorkspaceFeed"("userId", "isEnabled", "nextRefreshAt");

-- CreateIndex
CREATE INDEX "WorkspaceFeedSource_feedId_sourceType_idx" ON "WorkspaceFeedSource"("feedId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeedSource_feedId_folderId_key" ON "WorkspaceFeedSource"("feedId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeedSource_feedId_noteId_key" ON "WorkspaceFeedSource"("feedId", "noteId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeedSource_feedId_categoryId_key" ON "WorkspaceFeedSource"("feedId", "categoryId");

-- CreateIndex
CREATE INDEX "WorkspaceFeedItem_feedId_publishedAt_idx" ON "WorkspaceFeedItem"("feedId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeedItem_feedId_sourceKey_key" ON "WorkspaceFeedItem"("feedId", "sourceKey");
