import packageJson from "../../package.json";
import { APP_NAME } from "@/lib/runtime-constants";

export type AppEnvironment = "development" | "test" | "production";
export type AppLogLevel = "debug" | "info" | "warn" | "error";

type RawEnv = Record<string, string | undefined>;

export interface AppRuntimeEnv {
  name: string;
  version: string;
  environment: AppEnvironment;
  isDevelopment: boolean;
  isTest: boolean;
  isProduction: boolean;
  logLevel: AppLogLevel;
  deploymentId: string | null;
  gitSha: string | null;
}

export interface AuthRuntimeEnv {
  secret: string | null;
  nextAuthUrl: string | null;
  disableSecureCookies: boolean;
}

export interface DatabaseRuntimeEnv {
  url: string;
}

export interface AiRuntimeEnv {
  apiKey: string | null;
  enabled: boolean;
}

export interface StartupValidationResult {
  app: AppRuntimeEnv;
  auth: AuthRuntimeEnv;
  database: DatabaseRuntimeEnv;
  ai: AiRuntimeEnv;
  warnings: string[];
}

function readTrimmed(rawEnv: RawEnv, key: string) {
  const value = rawEnv[key]?.trim();
  return value ? value : null;
}

function readBoolean(rawEnv: RawEnv, key: string, defaultValue: boolean) {
  const value = readTrimmed(rawEnv, key);

  if (value === null) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${key} must be a boolean-like value (true/false, 1/0)`);
}

function readAppEnvironment(rawEnv: RawEnv): AppEnvironment {
  const value = readTrimmed(rawEnv, "NODE_ENV") ?? "development";

  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new Error(
    `NODE_ENV must be one of development, test, or production. Received: ${value}`
  );
}

function readLogLevel(rawEnv: RawEnv, environment: AppEnvironment): AppLogLevel {
  const value =
    readTrimmed(rawEnv, "LOG_LEVEL") ??
    (environment === "development" ? "debug" : "info");

  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  throw new Error(`LOG_LEVEL must be one of debug, info, warn, or error. Received: ${value}`);
}

export function getAppRuntimeEnv(rawEnv: RawEnv = process.env) {
  const environment = readAppEnvironment(rawEnv);

  return {
    name: APP_NAME,
    version: packageJson.version,
    environment,
    isDevelopment: environment === "development",
    isTest: environment === "test",
    isProduction: environment === "production",
    logLevel: readLogLevel(rawEnv, environment),
    deploymentId:
      readTrimmed(rawEnv, "DEPLOYMENT_ID") ??
      readTrimmed(rawEnv, "NEXT_DEPLOYMENT_ID"),
    gitSha:
      readTrimmed(rawEnv, "GIT_SHA") ??
      readTrimmed(rawEnv, "VERCEL_GIT_COMMIT_SHA"),
  } satisfies AppRuntimeEnv;
}

export function getAuthRuntimeEnv(rawEnv: RawEnv = process.env) {
  const app = getAppRuntimeEnv(rawEnv);
  const secret =
    readTrimmed(rawEnv, "AUTH_SECRET") ??
    readTrimmed(rawEnv, "NEXTAUTH_SECRET");

  return {
    secret,
    nextAuthUrl:
      readTrimmed(rawEnv, "NEXTAUTH_URL") ??
      (app.isProduction ? null : "http://localhost:3000"),
    disableSecureCookies: readBoolean(rawEnv, "AUTH_DISABLE_SECURE_COOKIES", false),
  } satisfies AuthRuntimeEnv;
}

export function getDatabaseRuntimeEnv(rawEnv: RawEnv = process.env) {
  const url = readTrimmed(rawEnv, "DATABASE_URL");

  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    url,
  } satisfies DatabaseRuntimeEnv;
}

export function getAiRuntimeEnv(rawEnv: RawEnv = process.env) {
  const apiKey = readTrimmed(rawEnv, "OPENAI_API_KEY");

  return {
    apiKey,
    enabled: Boolean(apiKey),
  } satisfies AiRuntimeEnv;
}

export function validateStartupEnv(rawEnv: RawEnv = process.env) {
  const app = getAppRuntimeEnv(rawEnv);
  const auth = getAuthRuntimeEnv(rawEnv);
  const database = getDatabaseRuntimeEnv(rawEnv);
  const ai = getAiRuntimeEnv(rawEnv);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (app.isProduction && !auth.secret) {
    errors.push("AUTH_SECRET is required in production");
  }

  if (app.isProduction && !auth.nextAuthUrl) {
    errors.push("NEXTAUTH_URL is required in production");
  }

  if (!ai.enabled) {
    warnings.push(
      "OPENAI_API_KEY is not configured. AI routes will rely on app-managed provider settings or return 503.",
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join("\n- ")}`);
  }

  return {
    app,
    auth,
    database,
    ai,
    warnings,
  } satisfies StartupValidationResult;
}
