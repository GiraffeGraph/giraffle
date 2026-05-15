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

const MODE_OPTIONS: { id: DesktopMode; title: string; description: string }[] = [
  {
    id: "local",
    title: "Local",
    description: "Yerleşik Postgres + Next sunucusu. Hiçbir bağımlılık yok.",
  },
  {
    id: "external-db",
    title: "Kendi Veritabanım",
    description: "Sunucu local çalışır, Postgres bağlantısını sen sağlarsın.",
  },
  {
    id: "remote",
    title: "Uzak Sunucu",
    description: "Mevcut bir Giraffle deployment'ına bağlanır.",
  },
];

type TauriInvoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null;
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } })
    .__TAURI__;
  return tauri?.core?.invoke ?? null;
}

export function useIsTauri(): boolean {
  const [isTauri, setIsTauri] = useState(false);
  useEffect(() => {
    if (getInvoke() != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTauri(true);
    }
  }, []);
  return isTauri;
}

export function DesktopModeCard() {
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<DesktopMode>("local");
  const [dbUrl, setDbUrl] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  useEffect(() => {
    const invoke = getInvoke();
    if (!invoke) return;
    let cancelled = false;
    invoke<DesktopConfig>("get_config")
      .then((value) => {
        if (cancelled) return;
        setConfig(value);
        if (value.mode === "local" || value.mode === "external-db" || value.mode === "remote") {
          setSelected(value.mode);
        }
        if (value.remote_url) setRemoteUrl(value.remote_url);
        if (value.remote_db_url) setDbUrl(value.remote_db_url);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tauri = (window as unknown as {
      __TAURI__?: {
        event?: {
          listen?: (
            event: string,
            cb: (e: { payload: { stage: string; detail?: string } }) => void,
          ) => Promise<() => void>;
        };
      };
    }).__TAURI__;
    const listen = tauri?.event?.listen;
    if (!listen) return;
    let unsub: (() => void) | null = null;
    listen("giraffle://launch-status", (event) => {
      const map: Record<string, string> = {
        spawning: "Sunucu başlatılıyor…",
        "pg-stop-previous": "Önceki Postgres durduruluyor…",
        "pg-stale-lock-cleared": "Eski kilit temizlendi.",
        "pg-initialise": "Postgres ilk kurulum…",
        "pg-start": "Postgres başlatılıyor…",
        "prisma-migrate": "Şema yükleniyor…",
        "prisma-skip": "Şema güncel, atlandı.",
        "next-start": "Uygulama sunucusu başlatılıyor…",
      };
      setStage(map[event.payload.stage] ?? event.payload.stage);
    }).then((fn) => {
      unsub = fn;
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const apply = async () => {
    const invoke = getInvoke();
    if (!invoke) return;
    setBusy(true);
    setApplyError(null);
    setStage("Hazırlanıyor…");
    try {
      const url = await invoke<string>("apply_mode", {
        mode: selected,
        dbUrl: selected === "local" ? null : dbUrl.trim(),
        url: selected === "remote" ? remoteUrl.trim() : null,
      });
      setStage("Yönlendiriliyor…");
      // Navigate to the new server, landing back on /settings so the user
      // sees the freshly applied mode.
      window.location.replace(`${url.replace(/\/$/, "")}/settings`);
    } catch (err) {
      setApplyError(String(err));
      setStage(null);
    } finally {
      setBusy(false);
    }
  };

  const openWizard = async () => {
    const invoke = getInvoke();
    if (!invoke) return;
    try {
      await invoke("open_settings_window");
    } catch (err) {
      setApplyError(String(err));
    }
  };

  const openDataDir = async () => {
    const invoke = getInvoke();
    if (!invoke) return;
    try {
      await invoke("open_data_dir");
    } catch (err) {
      setApplyError(String(err));
    }
  };

  const resetLocal = async () => {
    const invoke = getInvoke();
    if (!invoke) return;
    if (
      !window.confirm(
        "Local Postgres verisi (pgdata) ve auth secret silinecek. Bu işlem geri alınamaz. Devam?",
      )
    ) {
      return;
    }
    setBusy(true);
    setApplyError(null);
    setStage("Local veriler siliniyor…");
    try {
      await invoke("reset_local_data");
      setStage("Yeniden başlatılıyor…");
      const url = await invoke<string>("apply_mode", { mode: "local" });
      window.location.replace(`${url.replace(/\/$/, "")}/settings`);
    } catch (err) {
      setApplyError(String(err));
      setStage(null);
    } finally {
      setBusy(false);
    }
  };

  const currentMode = (config?.mode || "local") as DesktopMode;
  const isDirty =
    selected !== currentMode ||
    (selected !== "local" && dbUrl.trim() !== (config?.remote_db_url ?? "")) ||
    (selected === "remote" && remoteUrl.trim() !== (config?.remote_url ?? ""));

  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>Desktop Modu</CardTitle>
      </CardHeader>
      <CardContent>
        {!config && !loadError ? (
          <div style={{ fontSize: 13, color: "var(--md-sys-color-on-surface-variant)" }}>
            Yapılandırma yükleniyor…
          </div>
        ) : null}

        {loadError ? (
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 13 }}>
              Desktop yapılandırmasına ulaşılamadı. Tarayıcıda açtıysan normaldir;
              masaüstü uygulamasındaysan altta hata gözükür.
            </div>
            <pre style={{ fontSize: 11, color: "var(--md-sys-color-error)", whiteSpace: "pre-wrap" }}>
              {loadError}
            </pre>
          </div>
        ) : null}

        {config ? (
          <div style={{ display: "grid", gap: 14 }}>
            <ModeRadioGroup selected={selected} onChange={setSelected} />

            {selected === "external-db" ? (
              <Field
                label="Database URL"
                value={dbUrl}
                onChange={setDbUrl}
                placeholder="postgresql://user:pass@host:5432/db"
                monospace
              />
            ) : null}

            {selected === "remote" ? (
              <>
                <Field
                  label="App URL"
                  value={remoteUrl}
                  onChange={setRemoteUrl}
                  placeholder="https://giraffle.example.com"
                />
                <Field
                  label="Database URL"
                  value={dbUrl}
                  onChange={setDbUrl}
                  placeholder="postgresql://user:pass@host:5432/db"
                  monospace
                />
              </>
            ) : null}

            {stage ? (
              <div style={{ fontSize: 12, color: "var(--md-sys-color-on-surface-variant)" }}>
                {stage}
              </div>
            ) : null}

            {applyError ? (
              <pre style={{ fontSize: 11, color: "var(--md-sys-color-error)", whiteSpace: "pre-wrap" }}>
                {applyError}
              </pre>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <CardActions>
        <Button variant="outlined" onClick={openWizard} disabled={busy}>
          Wizard&apos;ı Aç
        </Button>
        <Button variant="outlined" onClick={openDataDir} disabled={busy}>
          Veri Klasörü
        </Button>
        {currentMode === "local" ? (
          <Button variant="outlined" onClick={resetLocal} disabled={busy}>
            Local Sıfırla
          </Button>
        ) : null}
        <Button variant="filled" onClick={apply} disabled={busy || !config || !isDirty}>
          {busy ? "Uygulanıyor…" : "Uygula"}
        </Button>
      </CardActions>
    </Card>
  );
}

function ModeRadioGroup({
  selected,
  onChange,
}: {
  selected: DesktopMode;
  onChange: (mode: DesktopMode) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {MODE_OPTIONS.map((opt) => {
        const active = opt.id === selected;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              textAlign: "left",
              border: active
                ? "1px solid var(--md-sys-color-primary)"
                : "1px solid var(--md-sys-color-outline-variant)",
              borderRadius: 10,
              padding: "10px 12px",
              background: active ? "rgba(245,165,36,0.06)" : "transparent",
              color: "inherit",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.title}</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--md-sys-color-on-surface-variant)",
                marginTop: 2,
              }}
            >
              {opt.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  monospace,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  monospace?: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--md-sys-color-on-surface-variant)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        style={{
          padding: "8px 10px",
          border: "1px solid var(--md-sys-color-outline-variant)",
          borderRadius: 8,
          background: "transparent",
          color: "inherit",
          fontFamily: monospace
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : "inherit",
          fontSize: 13,
        }}
      />
    </label>
  );
}
