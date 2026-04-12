import { getAppRuntimeEnv } from "@/lib/env.server";
import { REQUEST_ID_HEADER } from "@/lib/runtime-constants";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMetadata = Record<string, unknown>;

type HeaderLike = Pick<Headers, "get"> | Request;

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: LogLevel) {
  const app = getAppRuntimeEnv();
  return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[app.logLevel];
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error;
  }

  const app = getAppRuntimeEnv();

  return {
    name: error.name,
    message: error.message,
    stack: app.isProduction ? undefined : error.stack,
  };
}

function sanitizeMetadata(metadata: LogMetadata) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      value instanceof Error ? serializeError(value) : value,
    ])
  );
}

function writeLog(level: LogLevel, event: string, metadata: LogMetadata = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const app = getAppRuntimeEnv();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: app.name,
    version: app.version,
    environment: app.environment,
    deploymentId: app.deploymentId,
    gitSha: app.gitSha,
    ...sanitizeMetadata(metadata),
  };

  const payload = JSON.stringify(entry);

  switch (level) {
    case "debug":
      console.debug(payload);
      break;
    case "info":
      console.info(payload);
      break;
    case "warn":
      console.warn(payload);
      break;
    case "error":
      console.error(payload);
      break;
  }
}

export function getRequestId(input?: HeaderLike | null) {
  const headers = input instanceof Request ? input.headers : input;
  return headers?.get(REQUEST_ID_HEADER) ?? null;
}

export const logger = {
  debug(event: string, metadata?: LogMetadata) {
    writeLog("debug", event, metadata);
  },
  info(event: string, metadata?: LogMetadata) {
    writeLog("info", event, metadata);
  },
  warn(event: string, metadata?: LogMetadata) {
    writeLog("warn", event, metadata);
  },
  error(event: string, metadata?: LogMetadata) {
    writeLog("error", event, metadata);
  },
};
