import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDelegateKey(modelName: string) {
  return `${modelName.slice(0, 1).toLowerCase()}${modelName.slice(1)}`;
}

function hasCurrentModelDelegates(client: PrismaClient) {
  const delegateMap = client as unknown as Record<string, unknown>;

  return Object.values(Prisma.ModelName).every((modelName) => {
    const delegateKey = getDelegateKey(modelName);
    return typeof delegateMap[delegateKey] !== "undefined";
  });
}

function createPrismaClient(): PrismaClient {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const cachedClient = globalForPrisma.prisma;

if (cachedClient && !hasCurrentModelDelegates(cachedClient)) {
  void cachedClient.$disconnect().catch(() => undefined);
  globalForPrisma.prisma = undefined;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
