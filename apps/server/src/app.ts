import { Hono } from "hono";
import { vaultAuth, type AppEnv } from "./routes/auth.ts";
import { devicesRoutes } from "./routes/devices.ts";
import { healthRoutes } from "./routes/health.ts";
import { syncRoutes } from "./routes/sync.ts";
import type { Store } from "./storage/queries.ts";

export function createApp(store: Store) {
  const app = new Hono<AppEnv>();

  app.route("/health", healthRoutes(store));

  const vaults = new Hono<AppEnv>();
  vaults.use("/:vaultId/*", vaultAuth(store));
  vaults.route("/:vaultId/devices", devicesRoutes(store));
  vaults.route("/:vaultId/sync", syncRoutes(store));
  app.route("/api/v1/vaults", vaults);

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  // Relay failures must never echo internals back to a client that holds only
  // ciphertext; the operator gets the detail through the process log.
  app.onError((error, c) => {
    console.error("[giraffle-sync]", error);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
