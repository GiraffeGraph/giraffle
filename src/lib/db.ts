import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getAppRuntimeEnv, getDatabaseRuntimeEnv } from "@/lib/env.server";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const app = getAppRuntimeEnv();
  const database = getDatabaseRuntimeEnv();
  const pool = new Pool({
    connectionString: database.url,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: app.isDevelopment ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (!getAppRuntimeEnv().isProduction) {
  globalForPrisma.prisma = db;
}
