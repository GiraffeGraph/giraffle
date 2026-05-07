import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { startInboxTriageRun } from "@/domain/agents/inbox-triage/service";
import { InboxTriageStartSchema } from "@/domain/agents/inbox-triage/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = InboxTriageStartSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response("Invalid inbox triage payload", { status: 400 });
  }

  try {
    const result = await startInboxTriageRun({
      userId,
      limit: parsed.data.limit,
    });
    return Response.json(result);
  } catch (error) {
    logger.error("inbox_triage_start_failed", { userId, error });
    const message = error instanceof Error ? error.message : "Inbox triage failed";
    const status = message === "AI service is not configured" ? 503 : 500;
    return new Response(message, { status });
  }
}
