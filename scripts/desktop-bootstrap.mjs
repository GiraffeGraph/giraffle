#!/usr/bin/env node
// Desktop bootstrap. Starts embedded Postgres (when needed), runs prisma
// migrate deploy, then starts the Next standalone server. Prints a single
// JSON line `{"event":"ready","url":"..."}` to stdout when the HTTP server
// is listening so the Tauri host can open the webview.
//
// Env (provided by the Tauri host):
//   GIRAFFLE_MODE             local | external-db | remote (only local/external-db spawn server)
//   GIRAFFLE_DATA_DIR         absolute writable dir owned by the desktop app
//   GIRAFFLE_RESOURCE_DIR     absolute dir that contains standalone server + prisma assets
//   GIRAFFLE_DATABASE_URL     postgres URL (required when GIRAFFLE_MODE=external-db)
//   GIRAFFLE_PORT             optional port for Next (default: 0 -> auto-pick)
//   GIRAFFLE_AUTH_SECRET      optional; auto-generated under data dir if missing
//   GIRAFFLE_NEXTAUTH_URL     optional; defaults to http://127.0.0.1:<port>

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

function emit(event, payload = {}) {
  process.stdout.write(
    JSON.stringify({ event, ts: Date.now(), ...payload }) + "\n",
  );
}

function fatal(message, extra = {}) {
  emit("fatal", { message, ...extra });
  process.exit(1);
}

const MODE = process.env.GIRAFFLE_MODE || "local";
const DATA_DIR = process.env.GIRAFFLE_DATA_DIR;
const RESOURCE_DIR = process.env.GIRAFFLE_RESOURCE_DIR;

if (!DATA_DIR) fatal("GIRAFFLE_DATA_DIR not set");
if (!RESOURCE_DIR) fatal("GIRAFFLE_RESOURCE_DIR not set");
if (MODE !== "local" && MODE !== "external-db") {
  fatal(`unsupported GIRAFFLE_MODE: ${MODE}`);
}

mkdirSync(DATA_DIR, { recursive: true });

async function pickPort() {
  const preferred = Number(process.env.GIRAFFLE_PORT || 0);
  return new Promise((resolveFn, rejectFn) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", rejectFn);
    srv.listen(preferred, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolveFn(port));
    });
  });
}

function loadOrCreateSecret() {
  const existing = process.env.GIRAFFLE_AUTH_SECRET?.trim();
  if (existing) return existing;
  const secretPath = join(DATA_DIR, "auth.secret");
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf8").trim();
  }
  const secret = randomBytes(48).toString("base64url");
  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

async function startEmbeddedPostgres() {
  const pgDataDir = join(DATA_DIR, "pgdata");
  const pgPort = await pickPort();
  const user = "giraffle";
  const password = "giraffle_local";
  const database = "giraffle";

  let EmbeddedPostgres;
  try {
    const req = createRequire(join(RESOURCE_DIR, "package.json"));
    const resolved = req.resolve("embedded-postgres");
    ({ default: EmbeddedPostgres } = await import(pathToFileURL(resolved).href));
  } catch (err) {
    fatal("embedded-postgres module not installed", {
      detail: String(err),
      lookedIn: RESOURCE_DIR,
    });
    return;
  }

  const pg = new EmbeddedPostgres({
    databaseDir: pgDataDir,
    user,
    password,
    port: pgPort,
    persistent: true,
  });

  const initialized = existsSync(join(pgDataDir, "PG_VERSION"));
  if (!initialized) {
    emit("status", { stage: "pg-initialise" });
    await pg.initialise();
  }
  emit("status", { stage: "pg-start", port: pgPort });
  await pg.start();

  if (!initialized) {
    try {
      await pg.createDatabase(database);
    } catch (err) {
      const msg = String(err);
      if (!msg.includes("already exists")) throw err;
    }
  }

  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
    password,
  )}@127.0.0.1:${pgPort}/${database}?schema=public`;

  const stop = async () => {
    try {
      await pg.stop();
    } catch (err) {
      emit("warn", { message: "pg stop failed", detail: String(err) });
    }
  };
  return { url, stop };
}

function runMigrations(databaseUrl) {
  return new Promise((resolveFn, rejectFn) => {
    const prismaBin = resolve(
      RESOURCE_DIR,
      "node_modules",
      "prisma",
      "build",
      "index.js",
    );
    if (!existsSync(prismaBin)) {
      rejectFn(new Error(`prisma CLI not found at ${prismaBin}`));
      return;
    }
    emit("status", { stage: "prisma-migrate" });
    const child = spawn(
      process.execPath,
      [prismaBin, "migrate", "deploy", "--schema", join(RESOURCE_DIR, "prisma", "schema.prisma")],
      {
        cwd: RESOURCE_DIR,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          PRISMA_HIDE_UPDATE_MESSAGE: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => emit("prisma", { line: chunk.toString().trim() }));
    child.stderr.on("data", (chunk) => emit("prisma-err", { line: chunk.toString().trim() }));
    child.on("exit", (code) => {
      if (code === 0) resolveFn();
      else rejectFn(new Error(`prisma migrate deploy exited ${code}`));
    });
  });
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms`);
}

function startNextServer({ port, databaseUrl, authSecret }) {
  const serverEntry = join(RESOURCE_DIR, "server.js");
  if (!existsSync(serverEntry)) {
    throw new Error(`Next standalone server.js not found at ${serverEntry}`);
  }
  const url = `http://127.0.0.1:${port}`;
  emit("status", { stage: "next-start", url });
  const child = spawn(process.execPath, [serverEntry], {
    cwd: RESOURCE_DIR,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: authSecret,
      NEXTAUTH_URL: process.env.GIRAFFLE_NEXTAUTH_URL || url,
      UPLOAD_DIR: process.env.UPLOAD_DIR || join(DATA_DIR, "uploads"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => emit("next", { line: chunk.toString().trimEnd() }));
  child.stderr.on("data", (chunk) => emit("next-err", { line: chunk.toString().trimEnd() }));
  return { child, url };
}

async function main() {
  const authSecret = loadOrCreateSecret();
  let databaseUrl;
  let pgStop = async () => {};

  if (MODE === "local") {
    const pg = await startEmbeddedPostgres();
    databaseUrl = pg.url;
    pgStop = pg.stop;
  } else {
    databaseUrl = process.env.GIRAFFLE_DATABASE_URL?.trim();
    if (!databaseUrl) fatal("GIRAFFLE_DATABASE_URL required for external-db mode");
  }

  try {
    await runMigrations(databaseUrl);
  } catch (err) {
    await pgStop();
    fatal("prisma migrate deploy failed", { detail: String(err) });
  }

  const port = await pickPort();
  const { child, url } = startNextServer({ port, databaseUrl, authSecret });

  const shutdown = async (signal) => {
    emit("status", { stage: "shutdown", signal });
    try {
      child.kill("SIGTERM");
    } catch {}
    await pgStop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("message", (msg) => {
    if (msg === "shutdown") shutdown("ipc");
  });

  child.on("exit", async (code, signal) => {
    emit("next-exit", { code, signal });
    await pgStop();
    process.exit(code ?? 1);
  });

  try {
    await waitForHttp(url + "/api/health/ready");
  } catch {
    // Health endpoint may not exist; fall back to root probe.
    try {
      await waitForHttp(url);
    } catch (err) {
      fatal("Next server did not start", { detail: String(err) });
    }
  }

  emit("ready", { url });
}

main().catch((err) => fatal("bootstrap crashed", { detail: String(err) }));
