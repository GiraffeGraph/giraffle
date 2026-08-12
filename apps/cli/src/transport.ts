import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { WorkspaceError } from "@giraffle/headless";

interface Request {
  id: string;
  name: string;
  input: unknown;
  credential?: string;
}

interface Response {
  id?: string;
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
}

const CONNECT_ATTEMPTS = 100;
const RELEASE_BASE = "https://github.com/GiraffeGraph/giraffle/releases";
const MAC_APP_PATHS = ["/Applications/Giraffle.app", join(homedir(), "Applications", "Giraffle.app")];

export interface DesktopStatus {
  installed: boolean;
  path: string | null;
  platform: NodeJS.Platform;
}

export async function desktopStatus(): Promise<DesktopStatus> {
  if (process.platform !== "darwin") return { installed: false, path: null, platform: process.platform };
  for (const path of MAC_APP_PATHS) {
    try { await access(path); return { installed: true, path, platform: process.platform }; }
    catch { /* try the next standard application directory */ }
  }
  return { installed: false, path: null, platform: process.platform };
}

export async function openDesktopInstaller(version: string): Promise<{ opened: boolean; url: string }> {
  if (process.platform !== "darwin") throw new WorkspaceError("INVALID_INPUT", "Desktop installation is currently supported on macOS only");
  const url = `${RELEASE_BASE}/tag/v${version}`;
  spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  return { opened: true, url };
}

export async function executeRemote(name: string, input: unknown, credential?: string): Promise<unknown> {
  const request: Request = { id: randomUUID(), name, input, ...(credential ? { credential } : {}) };
  const paths = controlPaths();
  let launched = false;
  for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt++) {
    try {
      const token = (await readFile(paths.token, "utf8")).trim();
      const response = await exchange(paths.socket, { ...request, token });
      if (response.ok) return response.data;
      throw new WorkspaceError(normalizeCode(response.error?.code), response.error?.message ?? "Headless command failed");
    } catch (cause) {
      if (cause instanceof WorkspaceError) throw cause;
      if (!launched) {
        await launchDesktop();
        launched = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new WorkspaceError("VAULT_NOT_FOUND", "Giraffle desktop could not be reached. Run `giraffle desktop install`, then install or open Giraffle.app.");
}

function exchange(socketPath: string, request: object): Promise<Response> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socketPath);
    connection.setEncoding("utf8");
    let buffer = "";
    connection.once("connect", () => connection.write(`${JSON.stringify(request)}\n`));
    connection.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      connection.end();
      try { resolve(JSON.parse(buffer.slice(0, newline)) as Response); }
      catch { reject(new Error("Giraffle returned an invalid response")); }
    });
    connection.once("error", reject);
    connection.once("end", () => { if (!buffer.includes("\n")) reject(new Error("Giraffle closed the control connection")); });
  });
}

async function launchDesktop(): Promise<void> {
  const explicit = process.env.GIRAFFLE_DESKTOP_APP;
  if (explicit) {
    await access(explicit);
    const args = process.env.GIRAFFLE_DESKTOP_ARGS ? JSON.parse(process.env.GIRAFFLE_DESKTOP_ARGS) as unknown : [];
    if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new WorkspaceError("INVALID_INPUT", "GIRAFFLE_DESKTOP_ARGS must be a JSON string array");
    spawn(explicit, [...args, "--headless-service"], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", ["-gj", "-a", "Giraffle", "--args", "--headless-service"], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", "Giraffle.exe", "--headless-service"], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("giraffle-desktop", ["--headless-service"], { detached: true, stdio: "ignore" }).unref();
}

function controlPaths() {
  const userData = process.env.GIRAFFLE_DESKTOP_DATA ?? defaultUserData();
  return {
    socket: process.platform === "win32" ? "\\\\.\\pipe\\giraffle-headless" : join(userData, "headless", "control.sock"),
    token: join(userData, "headless", "token"),
  };
}

function defaultUserData(): string {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Giraffle");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Giraffle");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Giraffle");
}

function normalizeCode(code: string | undefined): "INVALID_INPUT" | "NOT_FOUND" | "VAULT_LOCKED" | "VAULT_NOT_FOUND" {
  if (code === "INVALID_INPUT" || code === "NOT_FOUND" || code === "VAULT_LOCKED" || code === "VAULT_NOT_FOUND") return code;
  return "VAULT_NOT_FOUND";
}
