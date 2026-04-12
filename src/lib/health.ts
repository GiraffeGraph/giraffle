import { db } from "@/lib/db";
import { getAppRuntimeEnv } from "@/lib/env.server";
import { APP_NAME } from "@/lib/runtime-constants";

function getBaseHealthPayload() {
  const app = getAppRuntimeEnv();

  return {
    service: APP_NAME,
    environment: app.environment,
    version: app.version,
    deploymentId: app.deploymentId,
    timestamp: new Date().toISOString(),
  };
}

export function getLivenessHealth() {
  return {
    ok: true,
    ...getBaseHealthPayload(),
    checks: {
      application: "ok",
    },
  } as const;
}

export async function getReadinessHealth() {
  try {
    await db.$queryRaw`SELECT 1`;

    return {
      status: 200,
      body: {
        ok: true,
        ...getBaseHealthPayload(),
        checks: {
          database: "ok",
        },
      },
    } as const;
  } catch {
    return {
      status: 503,
      body: {
        ok: false,
        ...getBaseHealthPayload(),
        checks: {
          database: "error",
        },
      },
    } as const;
  }
}
