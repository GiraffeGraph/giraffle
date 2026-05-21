-- Drop durable agents feature (inbox-triage + langgraph)

-- DropForeignKey
ALTER TABLE "AgentRunNoteSnapshot" DROP CONSTRAINT IF EXISTS "AgentRunNoteSnapshot_runId_fkey";
ALTER TABLE "AgentRunEvent" DROP CONSTRAINT IF EXISTS "AgentRunEvent_runId_fkey";
ALTER TABLE "AgentRunAction" DROP CONSTRAINT IF EXISTS "AgentRunAction_noteId_fkey";
ALTER TABLE "AgentRunAction" DROP CONSTRAINT IF EXISTS "AgentRunAction_runId_fkey";
ALTER TABLE "AgentRun" DROP CONSTRAINT IF EXISTS "AgentRun_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "AgentRunNoteSnapshot";
DROP TABLE IF EXISTS "AgentRunEvent";
DROP TABLE IF EXISTS "AgentRunAction";
DROP TABLE IF EXISTS "AgentRun";

-- Drop LangGraph postgres checkpointer tables (created at runtime, drop if present)
DROP TABLE IF EXISTS "checkpoint_writes" CASCADE;
DROP TABLE IF EXISTS "checkpoint_blobs" CASCADE;
DROP TABLE IF EXISTS "checkpoints" CASCADE;
DROP TABLE IF EXISTS "checkpoint_migrations" CASCADE;
