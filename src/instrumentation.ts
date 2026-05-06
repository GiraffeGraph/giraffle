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
    aiEnabled: config.ai.enabled,
  });

  for (const warning of config.warnings) {
    logger.warn("server_startup_warning", { warning });
  }
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
