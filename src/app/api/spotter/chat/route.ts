import { handleSpotterChatRequest, SPOTTER_CHAT_RATE_LIMIT } from "./handler";

export const maxDuration = 60;

export async function POST(req: Request) {
  return handleSpotterChatRequest(req, {
    route: "/api/spotter/chat",
    defaultMode: "workspace",
    allowSession: true,
    exposeSessionHeader: true,
    rateLimitKeyPrefix: "spotter",
    rateLimit: SPOTTER_CHAT_RATE_LIMIT,
  });
}
