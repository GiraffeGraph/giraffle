import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createGiraffleMcpServer } from "@/mcp/server";
import { resolveMcpBearerToken } from "@/domain/mcp/token.service";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  "Accept",
  "MCP-Protocol-Version",
  "Mcp-Session-Id",
  "Last-Event-ID",
].join(", ");

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
    },
  });
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}

async function handleMcpRequest(request: Request) {
  const token = await resolveMcpBearerToken(request.headers.get("authorization"));

  if (!token) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized MCP request. Use Authorization: Bearer <gfl_mcp_...>.",
        },
        id: null,
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="giraffle-mcp"',
        },
      },
    );
  }

  const rateLimit = consumeRateLimit(`mcp:${token.tokenId}`, {
    limit: 120,
    windowMs: 60_000,
    blockMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32029,
          message: "MCP rate limit exceeded. Retry later.",
        },
        id: null,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      },
    );
  }

  const server = createGiraffleMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const response = await transport.handleRequest(request, {
    authInfo: {
      token: token.token,
      clientId: token.tokenId,
      scopes: ["notes:read", "notes:write", "folders:read", "folders:write"],
      extra: {
        userId: token.userId,
        tokenId: token.tokenId,
        tokenName: token.name,
      },
    },
  });

  return response;
}
