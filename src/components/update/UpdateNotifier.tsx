"use client";

import { useEffect, useRef } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

type TauriInvoke = <T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<T>;

interface UpdateInfo {
  version: string;
  current_version: string;
  body?: string | null;
}

const DISMISS_KEY = "giraffle.update-notifier.dismissed-version";
const STARTUP_DELAY_MS = 8_000;

function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null;
  const tauri = (
    window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } }
  ).__TAURI__;
  return tauri?.core?.invoke ?? null;
}

export function UpdateNotifier() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const invoke = getInvoke();
    if (!invoke) return;

    let cancelled = false;

    const timeoutId = window.setTimeout(async () => {
      try {
        const info = await invoke<UpdateInfo | null>("get_update_info");
        if (cancelled || !info) return;

        const dismissed =
          typeof window !== "undefined"
            ? window.localStorage.getItem(DISMISS_KEY)
            : null;
        if (dismissed === info.version) return;

        const ok = await confirmDialog({
          title: `Update ${info.version} available`,
          message: `You are on ${info.current_version}. Install ${info.version} now? The app will restart.`,
          confirmLabel: "Install & restart",
          cancelLabel: "Later",
        });

        if (cancelled) return;

        if (ok) {
          try {
            await invoke("install_update");
          } catch (err) {
            console.error("install_update failed", err);
          }
        } else {
          window.localStorage.setItem(DISMISS_KEY, info.version);
        }
      } catch (err) {
        console.warn("update check failed", err);
      }
    }, STARTUP_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
