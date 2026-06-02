import "@testing-library/jest-dom/vitest";

// src/lib/db.ts instantiates Prisma at import time via getDatabaseRuntimeEnv(),
// which throws if DATABASE_URL is unset. Tests that import the db chain without
// mocking it (e.g. via a domain service) would crash on import. Provide a dummy
// connection string — nothing in unit tests actually connects.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://test:test@localhost:5432/test?schema=public";
}
