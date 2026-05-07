import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { resumeInboxTriageRun } from "@/domain/agents/inbox-triage/service";
import { ApprovalResumeSchema } from "@/domain/agents/inbox-triage/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [{ id }, rawBody] = await Promise.all([
    ctx.params,
    req.json().catch(() => null),
  ]);
  const parsed = ApprovalResumeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response("Invalid approval payload", { status: 400 });
  }

  try {
    const result = await resumeInboxTriageRun({
      userId,
      runId: id,
      decisions: parsed.data.decisions,
    });
    return Response.json(result);
  } catch (error) {
    logger.error("inbox_triage_resume_failed", { userId, runId: id, error });
    const message = error instanceof Error ? error.message : "Inbox triage resume failed";
    const status = message === "Agent run not found" ? 404 : 500;
    return new Response(message, { status });
  }
}
