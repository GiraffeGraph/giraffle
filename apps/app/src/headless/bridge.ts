import { HeadlessExecutor } from "@giraffle/headless";
import type { VaultRepository } from "@/infrastructure/database/repository";

interface DesktopHeadlessRequest {
  id: string;
  name: string;
  input: unknown;
  credential?: string;
}

interface DesktopHeadlessResponse {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

type DesktopHeadlessApi = {
  subscribe(handler: (request: DesktopHeadlessRequest) => void): () => void;
  respond(response: DesktopHeadlessResponse): void;
};

declare global {
  interface Window {
    giraffleHeadless?: DesktopHeadlessApi;
  }
}

export interface HeadlessRuntime {
  repository(): VaultRepository | null;
  unlock(credential: string): Promise<void>;
  run<T>(action: (repository: VaultRepository) => Promise<T>): Promise<T>;
}

export function installHeadlessBridge(runtime: HeadlessRuntime): () => void {
  const api = typeof window === "undefined" ? undefined : window.giraffleHeadless;
  if (!api) return () => undefined;

  return api.subscribe((request) => {
    void (async () => {
      try {
        if (!runtime.repository()) {
          if (!request.credential) throw headlessError("VAULT_LOCKED", "Vault is locked; provide a passphrase through the CLI");
          await runtime.unlock(request.credential);
          await waitForRepository(runtime);
        }
        const data = await runtime.run((repository) => new HeadlessExecutor(repository).execute(request.name, request.input));
        api.respond({ id: request.id, ok: true, data });
      } catch (cause) {
        api.respond({ id: request.id, ok: false, error: serializeError(cause) });
      }
    })();
  });
}

async function waitForRepository(runtime: HeadlessRuntime): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (runtime.repository()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw headlessError("VAULT_LOCKED", "Vault unlocked but its repository did not become ready");
}

function headlessError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function serializeError(cause: unknown): { code: string; message: string } {
  if (cause && typeof cause === "object") {
    const value = cause as { code?: unknown; message?: unknown };
    return {
      code: typeof value.code === "string" ? value.code : inferCode(String(value.message ?? "")),
      message: typeof value.message === "string" ? value.message : "Headless command failed",
    };
  }
  return { code: "INTERNAL_ERROR", message: "Headless command failed" };
}

function inferCode(message: string): string {
  if (/not found/i.test(message)) return "NOT_FOUND";
  if (/locked|passphrase|unlock/i.test(message)) return "VAULT_LOCKED";
  return "INTERNAL_ERROR";
}
