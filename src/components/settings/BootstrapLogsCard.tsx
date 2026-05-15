"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardActions, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type TauriInvoke = <T = unknown>(cmd: string) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null;
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } })
    .__TAURI__;
  return tauri?.core?.invoke ?? null;
}

export function BootstrapLogsCard() {
  const [logs, setLogs] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchLogs = useCallback(async () => {
    const invoke = getInvoke();
    if (!invoke) return;
    setBusy(true);
    setError(null);
    try {
      const value = await invoke<string>("get_bootstrap_logs");
      setLogs(value);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const copy = useCallback(async () => {
    if (!logs) return;
    try {
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(String(err));
    }
  }, [logs]);

  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>Bootstrap Logları</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)", marginBottom: 8 }}>
          Sunucu başlatma sırasında biriken son satırlar. Hata debug ederken paylaş.
        </div>
        {error ? (
          <pre style={{ fontSize: 11, color: "var(--md-sys-color-error)", whiteSpace: "pre-wrap" }}>{error}</pre>
        ) : null}
        <pre
          style={{
            background: "rgba(0,0,0,0.18)",
            border: "1px solid var(--md-sys-color-outline-variant)",
            borderRadius: 8,
            padding: 10,
            fontSize: 11,
            lineHeight: 1.4,
            maxHeight: 280,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {logs || "(Henüz yüklenmedi — Yenile'ye bas.)"}
        </pre>
      </CardContent>
      <CardActions>
        <Button variant="outlined" onClick={fetchLogs} disabled={busy}>
          {busy ? "Yükleniyor…" : "Yenile"}
        </Button>
        <Button variant="filled" onClick={copy} disabled={!logs}>
          {copied ? "Kopyalandı ✓" : "Panoya Kopyala"}
        </Button>
      </CardActions>
    </Card>
  );
}
