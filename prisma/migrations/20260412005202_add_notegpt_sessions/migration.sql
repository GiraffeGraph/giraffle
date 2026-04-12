-- CreateTable
CREATE TABLE "NoteGptSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Yeni sohbet',
    "userId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteGptSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteGptMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteGptMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoteGptSession_userId_lastMessageAt_idx" ON "NoteGptSession"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "NoteGptMessage_sessionId_createdAt_idx" ON "NoteGptMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "NoteGptSession" ADD CONSTRAINT "NoteGptSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteGptMessage" ADD CONSTRAINT "NoteGptMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "NoteGptSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
