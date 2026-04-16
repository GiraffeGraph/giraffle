/**
 * SSH Connection Manager — singleton SSH2 connection pool.
 * Manages persistent connections per machine, keyed by machine ID.
 */
import type { Client as SshClient, ConnectConfig, ClientChannel } from "ssh2";
import { db } from "@/lib/db";

// Lazy import to avoid breaking edge/browser bundles
async function getSsh2(): Promise<{ Client: typeof SshClient }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("ssh2") as { Client: typeof SshClient };
}

function decryptCredential(encrypted: string): string {
  // Mirror of the base64 encoding used in machines.service.ts
  return Buffer.from(encrypted, "base64").toString("utf-8");
}

interface MachineRecord {
  host: string;
  port: number;
  username: string;
  authType: string;
  sshCredential: string;
}

type ConnectionEntry = {
  client: SshClient;
  machineId: string;
};

const globalForSsh = globalThis as unknown as {
  __sshPool: Map<string, ConnectionEntry> | undefined;
};

if (!globalForSsh.__sshPool) {
  globalForSsh.__sshPool = new Map();
}

const pool = globalForSsh.__sshPool;

async function loadMachine(machineId: string): Promise<MachineRecord | null> {
  return db.machine.findUnique({
    where: { id: machineId },
    select: {
      host: true,
      port: true,
      username: true,
      authType: true,
      sshCredential: true,
    },
  });
}

function buildConnectConfig(machine: MachineRecord): ConnectConfig {
  const credential = decryptCredential(machine.sshCredential);
  const base: ConnectConfig = {
    host: machine.host,
    port: machine.port,
    username: machine.username,
    readyTimeout: 8_000,
    keepaliveInterval: 30_000,
  };

  if (machine.authType === "key") {
    return { ...base, privateKey: credential };
  }
  return { ...base, password: credential };
}

/** Open and cache a connection. Rejects on auth/timeout failure. */
export async function sshConnect(machineId: string): Promise<SshClient> {
  const existing = pool.get(machineId);
  if (existing) return existing.client;

  const machine = await loadMachine(machineId);
  if (!machine) throw new Error(`Machine ${machineId} not found`);

  const { Client } = await getSsh2();
  const client = new Client();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error("SSH connection timed out"));
    }, 10_000);

    client
      .on("ready", () => {
        clearTimeout(timeout);
        resolve();
      })
      .on("error", (err) => {
        clearTimeout(timeout);
        pool.delete(machineId);
        reject(err);
      })
      .on("close", () => {
        pool.delete(machineId);
      })
      .connect(buildConnectConfig(machine));
  });

  pool.set(machineId, { client, machineId });
  return client;
}

export function sshDisconnect(machineId: string): void {
  const entry = pool.get(machineId);
  if (entry) {
    entry.client.end();
    pool.delete(machineId);
  }
}

/** Ping: connect → exec `echo ok` → measure round-trip. Returns latency ms. */
export async function sshPing(machineId: string): Promise<number> {
  const start = Date.now();
  const client = await sshConnect(machineId);

  await new Promise<void>((resolve, reject) => {
    client.exec("echo ok", (err, stream) => {
      if (err) return reject(err);
      stream.on("close", () => resolve());
      stream.stderr.resume();
      stream.resume();
    });
  });

  return Date.now() - start;
}

/** One-shot command execution. Returns { stdout, stderr, exitCode }. */
export async function sshExec(
  machineId: string,
  command: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const client = await sshConnect(machineId);

  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let exitCode = 0;

      stream
        .on("close", (code: number) => {
          exitCode = code ?? 0;
          resolve({
            stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
            stderr: Buffer.concat(stderrChunks).toString("utf-8"),
            exitCode,
          });
        })
        .on("data", (chunk: Buffer) => stdoutChunks.push(chunk))
        .stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    });
  });
}

/** Open an interactive PTY shell. Returns the channel. */
export async function sshOpenShell(
  machineId: string,
  cols = 80,
  rows = 24,
): Promise<ClientChannel> {
  const client = await sshConnect(machineId);

  return new Promise((resolve, reject) => {
    client.shell({ term: "xterm-256color", cols, rows }, (err, stream) => {
      if (err) return reject(err);
      resolve(stream);
    });
  });
}

/** Resize an open PTY (call after browser terminal resize). */
export function sshResizeShell(channel: ClientChannel, cols: number, rows: number): void {
  (channel as unknown as { setWindow: (rows: number, cols: number) => void }).setWindow(rows, cols);
}

/** Ping all machines and update their status in DB. */
export async function pingAllMachines(): Promise<void> {
  const machines = await db.machine.findMany({
    select: { id: true },
  });

  await Promise.allSettled(
    machines.map(async ({ id }) => {
      try {
        await sshPing(id);
        await db.machine.update({
          where: { id },
          data: { status: "online", lastPingAt: new Date() },
        });
      } catch {
        pool.delete(id);
        await db.machine.update({
          where: { id },
          data: { status: "offline", lastPingAt: new Date() },
        });
      }
    }),
  );
}
