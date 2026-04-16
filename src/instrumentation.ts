import type { Instrumentation } from "next";
import { validateStartupEnv } from "@/lib/env.server";
import { REQUEST_ID_HEADER } from "@/lib/runtime-constants";
import { logger } from "@/lib/logger";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const config = validateStartupEnv();

  logger.info("server_startup", {
    requestIdHeader: REQUEST_ID_HEADER,
    authConfigured: Boolean(config.auth.secret),
    feedRefreshEnabled: config.feed.enabled,
    aiEnabled: config.ai.enabled,
  });

  for (const warning of config.warnings) {
    logger.warn("server_startup_warning", { warning });
  }

  // ── Giraffe Agents: WebSocket terminal server ──────────────────────────
  try {
    const { startWsTerminalServer } = await import("@/lib/ws-terminal-server");
    await startWsTerminalServer();
    logger.info("ws_terminal_server_started", {
      port: process.env.WS_TERMINAL_PORT ?? "3001",
    });
  } catch (err) {
    logger.warn("ws_terminal_server_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Giraffe Agents: Periodic SSH machine ping (every 60s) ──────────────
  const { pingAllMachines } = await import("@/lib/ssh-manager");
  setInterval(() => {
    void pingAllMachines().catch((err: unknown) => {
      logger.warn("ping_all_machines_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, 60_000);
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  const requestIdHeader = request.headers[REQUEST_ID_HEADER];
  const requestId = Array.isArray(requestIdHeader)
    ? requestIdHeader[0] ?? null
    : requestIdHeader ?? null;
  const digest =
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : null;

  logger.error("request_error", {
    requestId,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    digest,
    error,
  });
};
