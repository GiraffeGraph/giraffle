-- AlterTable
ALTER TABLE "SpotterMessage" ADD COLUMN "parts" JSONB;

-- CreateTable
CREATE TABLE "Trail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailCredential" (
    "id" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'default',
    "encryptedSecret" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrailCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailToolAllow" (
    "id" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrailToolAllow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trailId" TEXT,
    "sessionId" TEXT,
    "messageId" TEXT,
    "toolName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB,
    "outputSnippet" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trail_userId_status_idx" ON "Trail"("userId", "status");
CREATE UNIQUE INDEX "Trail_userId_kind_label_key" ON "Trail"("userId", "kind", "label");

-- CreateIndex
CREATE INDEX "TrailCredential_trailId_idx" ON "TrailCredential"("trailId");
CREATE UNIQUE INDEX "TrailCredential_trailId_scope_key" ON "TrailCredential"("trailId", "scope");

-- CreateIndex
CREATE INDEX "TrailToolAllow_trailId_idx" ON "TrailToolAllow"("trailId");
CREATE UNIQUE INDEX "TrailToolAllow_trailId_toolName_key" ON "TrailToolAllow"("trailId", "toolName");

-- CreateIndex
CREATE INDEX "TrailLog_userId_createdAt_idx" ON "TrailLog"("userId", "createdAt");
CREATE INDEX "TrailLog_trailId_createdAt_idx" ON "TrailLog"("trailId", "createdAt");
CREATE INDEX "TrailLog_sessionId_createdAt_idx" ON "TrailLog"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Trail" ADD CONSTRAINT "Trail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailCredential" ADD CONSTRAINT "TrailCredential_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailToolAllow" ADD CONSTRAINT "TrailToolAllow_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailLog" ADD CONSTRAINT "TrailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrailLog" ADD CONSTRAINT "TrailLog_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE SET NULL ON UPDATE CASCADE;
