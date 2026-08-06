import { Hono } from "hono";
import type { Store } from "../storage/queries.ts";

export function healthRoutes(store: Store) {
  const routes = new Hono();

  // Liveness answers as long as the process can serve; it must not touch the
  // database, or a locked database would make an orchestrator kill a healthy process.
  routes.get("/live", (c) => c.json({ status: "live" }));

  routes.get("/ready", (c) => {
    try {
      if (!store.isReady()) throw new Error("Database probe returned no row");
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
    return c.json({ status: "ready" });
  });

  return routes;
}
