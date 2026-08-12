const { strict: assert } = require("node:assert");
const { once } = require("node:events");
const { mkdtemp, rm, stat } = require("node:fs/promises");
const { connect } = require("node:net");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { readHeadlessToken, startHeadlessServer } = require("./headless-server.cjs");

test("headless socket authenticates and forwards one command", async (context) => {
  if (process.platform === "win32") context.skip("named pipe permissions differ on Windows");
  const userData = await mkdtemp(path.join(tmpdir(), "giraffle-headless-"));
  const server = await startHeadlessServer({ userData, dispatch: async (request) => ({ id: request.id, ok: true, data: { name: request.name } }) });
  context.after(async () => { await server.close(); await rm(userData, { recursive: true, force: true }); });
  const token = await readHeadlessToken(userData);
  const response = await exchange(server.paths.socket, { token, id: "1", name: "pages_search", input: { query: "x" } });
  assert.deepEqual(response, { id: "1", ok: true, data: { name: "pages_search" } });
  assert.equal((await stat(server.paths.socket)).mode & 0o777, 0o600);
  assert.equal((await stat(server.paths.token)).mode & 0o777, 0o600);
});

test("headless socket rejects an invalid token", async (context) => {
  if (process.platform === "win32") context.skip("named pipe permissions differ on Windows");
  const userData = await mkdtemp(path.join(tmpdir(), "giraffle-headless-"));
  const server = await startHeadlessServer({ userData, dispatch: async () => ({ ok: true }) });
  context.after(async () => { await server.close(); await rm(userData, { recursive: true, force: true }); });
  const response = await exchange(server.paths.socket, { token: "wrong", id: "1", name: "pages_search", input: {} });
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "UNAUTHORIZED");
});

async function exchange(socket, request) {
  const connection = connect(socket);
  await once(connection, "connect");
  connection.end(`${JSON.stringify(request)}\n`);
  let body = "";
  connection.setEncoding("utf8");
  for await (const chunk of connection) body += chunk;
  return JSON.parse(body);
}
