"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardActions, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type DesktopMode = "local" | "external-db" | "remote";

interface DesktopConfig {
  mode: DesktopMode | "";
  remote_url: string;
  remote_db_url: string;
}

const MODE_LABEL: Record<DesktopMode, { title: string; description: string }> = {
  local: {
    title: "Local",
    description: "Yerleşik Postgres + Next sunucusu. Hiçbir bağımlılık yok.",
  },
  "external-db": {
    title: "Kendi Veritabanım",
    description: "Sunucu local çalışır, Postgres bağlantısını sen sağlarsın.",
  },
  remote: {
    title: "Uzak Sunucu",
    description: "Mevcut bir Giraffle deployment'ına bağlanır.",
  },
};

type TauriInvoke = (cmd: string) => Promise<unknown>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null;
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } })
    .__TAURI__;
  return tauri?.core?.invoke ?? null;
}

export function DesktopModeCard() {
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const invoke = getInvoke();
    if (!invoke) return;
    let cancelled = false;
    invoke("get_config")
      .then((value) => {
        if (cancelled) return;
        setConfig(value as DesktopConfig);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reconfigure = async () => {
    const invoke = getInvoke();
    if (!invoke) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("open_settings_window");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!config && !error) {
    return (
      <Card variant="outlined">
        <CardHeader>
          <CardTitle>Desktop Modu</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
            Yapılandırma yükleniyor…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!config && error) {
    return (
      <Card variant="outlined">
        <CardHeader>
          <CardTitle>Desktop Modu</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13 }}>
              Desktop yapılandırmasına ulaşılamadı. Bu Settings sayfası tarayıcıdaysa
              normaldir; masaüstü uygulamasındaysan altta hata gözükür.
            </div>
            <pre style={{ fontSize: 11, color: "var(--md-sys-color-error)", whiteSpace: "pre-wrap" }}>
              {error}
            </pre>
          </div>
        </CardContent>
        <CardActions>
          <Button variant="filled" onClick={reconfigure} disabled={busy}>
            {busy ? "Açılıyor…" : "Yeniden Yapılandır"}
          </Button>
        </CardActions>
      </Card>
    );
  }

  const modeKey = (config!.mode || "local") as DesktopMode;
  const info = MODE_LABEL[modeKey] ?? MODE_LABEL.local;

  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>Desktop Modu</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Aktif mod
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{info.title}</div>
            <div style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)", marginTop: 2 }}>
              {info.description}
            </div>
          </div>
          {modeKey === "remote" && config!.remote_url ? (
            <ModeDetail label="App URL" value={config!.remote_url} />
          ) : null}
          {modeKey !== "local" && config!.remote_db_url ? (
            <ModeDetail label="Database URL" value={maskDbUrl(config!.remote_db_url)} />
          ) : null}
          {error ? (
            <div style={{ color: "var(--md-sys-color-error)", fontSize: 12 }}>{error}</div>
          ) : null}
        </div>
      </CardContent>
      <CardActions>
        <Button variant="filled" onClick={reconfigure} disabled={busy}>
          {busy ? "Açılıyor…" : "Yeniden Yapılandır"}
        </Button>
      </CardActions>
    </Card>
  );
}

function ModeDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--md-sys-color-on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <code style={{ fontSize: 12, wordBreak: "break-all" }}>{value}</code>
    </div>
  );
}

function maskDbUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function useIsTauri(): boolean {
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    setIsTauri(getInvoke() != null);
  }, []);
  return isTauri;
}
