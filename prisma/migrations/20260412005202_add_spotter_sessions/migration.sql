-- CreateTable
CREATE TABLE "SpotterSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "userId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotterSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpotterMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpotterMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpotterSession_userId_lastMessageAt_idx" ON "SpotterSession"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SpotterMessage_sessionId_createdAt_idx" ON "SpotterMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SpotterSession" ADD CONSTRAINT "SpotterSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpotterMessage" ADD CONSTRAINT "SpotterMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpotterSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
