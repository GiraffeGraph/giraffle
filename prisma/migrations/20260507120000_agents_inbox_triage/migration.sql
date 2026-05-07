-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "threadId" TEXT NOT NULL,
    "noteCount" INTEGER,
    "summary" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunAction" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "noteId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRunAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunNoteSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "folderId" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRunNoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_threadId_key" ON "AgentRun"("threadId");
CREATE INDEX "AgentRun_userId_createdAt_idx" ON "AgentRun"("userId", "createdAt");
CREATE INDEX "AgentRun_userId_status_idx" ON "AgentRun"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentRunAction_runId_status_idx" ON "AgentRunAction"("runId", "status");
CREATE INDEX "AgentRunAction_noteId_idx" ON "AgentRunAction"("noteId");
CREATE UNIQUE INDEX "AgentRunAction_runId_id_key" ON "AgentRunAction"("runId", "id");

-- CreateIndex
CREATE INDEX "AgentRunEvent_runId_createdAt_idx" ON "AgentRunEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRunNoteSnapshot_runId_idx" ON "AgentRunNoteSnapshot"("runId");
CREATE INDEX "AgentRunNoteSnapshot_noteId_idx" ON "AgentRunNoteSnapshot"("noteId");
CREATE UNIQUE INDEX "AgentRunNoteSnapshot_runId_noteId_key" ON "AgentRunNoteSnapshot"("runId", "noteId");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunAction" ADD CONSTRAINT "AgentRunAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunAction" ADD CONSTRAINT "AgentRunAction_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunNoteSnapshot" ADD CONSTRAINT "AgentRunNoteSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
