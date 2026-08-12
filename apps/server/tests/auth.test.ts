import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SYNC_RATE_LIMIT } from "../src/routes/auth.ts";
import {
  createHarness,
  enroll,
  OTHER_TOKEN,
  OTHER_VAULT_ID,
  pull,
  VAULT_ID,
  type TestHarness,
} from "./helpers.ts";

let harness: TestHarness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(() => {
  harness.store.close();
});

describe("vault authorization", () => {
  it("answers browser and Electron preflight requests", async () => {
    const response = await harness.app.request(`/api/v1/vaults/${VAULT_ID}/sync/pull`, {
      method: "OPTIONS",
      headers: {
        Origin: "giraffle-app://app",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,x-giraffle-device-id",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-Giraffle-Device-Id",
    );
  });

  it("answers 401 when no bearer token is presented", async () => {
    const response = await harness.app.request(`/api/v1/vaults/${VAULT_ID}/sync/pull`);

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="giraffle-sync"');
  });

  it("answers 401 for an unknown bearer token", async () => {
    const response = await pull(harness, "", "not-a-configured-token-000000000000");
    expect(response.status).toBe(401);
  });

  it("answers 404 for a token scoped to another vault, without leaking existence", async () => {
    expect((await enroll(harness)).status).toBe(201);

    const response = await pull(harness, "", OTHER_TOKEN);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Vault not found" });
  });

  it("answers 404 when the vault has no enrolled device yet", async () => {
    const response = await pull(harness, "", OTHER_TOKEN, OTHER_VAULT_ID);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Vault not found" });
  });

  it("answers 400 for a malformed vault identifier", async () => {
    const response = await harness.app.request("/api/v1/vaults/not%20a%20vault/sync/pull");
    expect(response.status).toBe(400);
  });

  it("answers 429 with Retry-After once the fixed window is exhausted", async () => {
    for (let attempt = 0; attempt < SYNC_RATE_LIMIT.limit; attempt += 1) {
      const allowed = await pull(harness);
      expect(allowed.status).not.toBe(429);
    }

    const blocked = await pull(harness);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "Sync rate limit exceeded" });

    const retryAfter = Number(blocked.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(SYNC_RATE_LIMIT.blockMs / 1000);
  });
});

describe("health", () => {
  it("reports liveness and readiness", async () => {
    const live = await harness.app.request("/health/live");
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "live" });

    const ready = await harness.app.request("/health/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
  });

  it("reports 503 readiness once the database is gone", async () => {
    harness.store.close();

    const ready = await harness.app.request("/health/ready");
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: "unavailable" });

    // The afterEach close would otherwise fail on an already closed database.
    harness.store.close = () => {};
  });
});
