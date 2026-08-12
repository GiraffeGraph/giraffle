const { createServer } = require("node:net");
const { chmod, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { randomBytes } = require("node:crypto");
const path = require("node:path");

const MAX_REQUEST_BYTES = 1024 * 1024;
const RESPONSE_TIMEOUT_MS = 30_000;

function headlessPaths(userData) {
  return {
    directory: path.join(userData, "headless"),
    socket: process.platform === "win32" ? "\\\\.\\pipe\\giraffle-headless" : path.join(userData, "headless", "control.sock"),
    token: path.join(userData, "headless", "token"),
  };
}

async function startHeadlessServer({ userData, dispatch }) {
  const paths = headlessPaths(userData);
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(paths.directory, 0o700);
  if (process.platform !== "win32") await rm(paths.socket, { force: true }).catch(() => undefined);
  const token = randomBytes(32).toString("base64url");
  await writeFile(paths.token, `${token}\n`, { mode: 0o600 });
  if (process.platform !== "win32") await chmod(paths.token, 0o600);

  const server = createServer((connection) => {
    connection.setEncoding("utf8");
    let buffer = "";
    let handled = false;
    connection.on("data", (chunk) => {
      if (handled) return;
      buffer += chunk;
      if (new TextEncoder().encode(buffer).length > MAX_REQUEST_BYTES) {
        handled = true;
        connection.end(JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "Request is too large" } }) + "\n");
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      let request;
      try {
        request = JSON.parse(buffer.slice(0, newline));
        if (!request || request.token !== token || typeof request.id !== "string" || typeof request.name !== "string") throw new Error("Invalid request");
      } catch {
        connection.end(JSON.stringify({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid headless request" } }) + "\n");
        return;
      }
      const timer = setTimeout(() => {
        connection.end(JSON.stringify({ ok: false, error: { code: "TIMEOUT", message: "Giraffle did not finish the command" } }) + "\n");
      }, RESPONSE_TIMEOUT_MS);
      Promise.resolve(dispatch(request)).then(
        (response) => { clearTimeout(timer); connection.end(JSON.stringify(response) + "\n"); },
        (cause) => { clearTimeout(timer); connection.end(JSON.stringify({ id: request.id, ok: false, error: { code: "INTERNAL_ERROR", message: cause instanceof Error ? cause.message : "Command failed" } }) + "\n"); },
      );
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(paths.socket, () => { server.off("error", reject); resolve(); });
  });
  if (process.platform !== "win32") await chmod(paths.socket, 0o600);
  return {
    paths,
    close: async () => {
      await new Promise((resolve) => server.close(() => resolve()));
      await Promise.all([
        process.platform === "win32" ? Promise.resolve() : rm(paths.socket, { force: true }),
        rm(paths.token, { force: true }),
      ]);
    },
  };
}

async function readHeadlessToken(userData) {
  return (await readFile(headlessPaths(userData).token, "utf8")).trim();
}

module.exports = { headlessPaths, readHeadlessToken, startHeadlessServer };
