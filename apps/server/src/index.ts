import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { openDatabase } from "./storage/database.ts";
import { createStore } from "./storage/queries.ts";

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`[giraffle-sync] ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const store = createStore(openDatabase(config.databasePath));
  store.replaceAccessTokens(config.accessTokens);

  const server = serve(
    { fetch: createApp(store).fetch, hostname: config.host, port: config.port },
    (info) => {
      console.log(`[giraffle-sync] listening on ${config.host}:${info.port}`);
    },
  );

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      server.close(() => {
        store.close();
        process.exit(0);
      });
    });
  }
}

main();
