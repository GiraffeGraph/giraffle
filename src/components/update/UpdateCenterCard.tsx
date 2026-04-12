"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardActions, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { AppUpdateStatus } from "@/domain/update/update.types";

function formatReleaseDate(value: string | null) {
  if (!value) {
    return "Bilinmiyor";
  }

  return new Date(value).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getReleasePreview(notes: string | null) {
  if (!notes) {
    return null;
  }

  const normalized = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n");

  return normalized || null;
}

export function UpdateCenterCard({
  status,
}: {
  status: AppUpdateStatus;
}) {
  const [copied, setCopied] = useState(false);
  const releasePreview = useMemo(() => getReleasePreview(status.releaseNotes), [status.releaseNotes]);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(status.updateCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Card id="updates" variant="outlined">
      <CardHeader>
        <CardTitle>Güncelleme Merkezi</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: "16px" }}>
          <div
            style={{
              display: "grid",
              gap: "10px",
              padding: "16px",
              borderRadius: "16px",
              background: status.updateAvailable
                ? "var(--md-sys-color-primary-container)"
                : "var(--md-sys-color-surface-container)",
              color: status.updateAvailable
                ? "var(--md-sys-color-on-primary-container)"
                : "var(--md-sys-color-on-surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <strong>
                {status.updateAvailable && status.latestVersion
                  ? `Yeni sürüm hazır: ${status.latestVersion}`
                  : "Kurulu sürüm güncel görünüyor"}
              </strong>
              <span style={{ opacity: 0.85 }}>Kurulu: {status.currentVersion}</span>
            </div>

            <div style={{ fontSize: "14px", lineHeight: 1.5 }}>
              {status.updateAvailable
                ? "Kullanıcıların doğrudan görebileceği bir bildirim aktif. Sunucuda aşağıdaki komutları çalıştırarak yeni sürüme geçebilirsin."
                : "GitHub release kaydı üzerinden periyodik sürüm kontrolü yapılıyor. Yeni bir sürüm yayınlandığında burada bildirim görünecek."}
            </div>

            <div style={{ display: "grid", gap: "4px", fontSize: "13px", opacity: 0.9 }}>
              <span>Kaynak: GitHub Releases</span>
              <span>Kontrol zamanı: {formatReleaseDate(status.checkedAt)}</span>
              <span>Yayın tarihi: {formatReleaseDate(status.publishedAt)}</span>
            </div>
          </div>

          {releasePreview ? (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid var(--md-sys-color-outline-variant)",
                background: "var(--md-sys-color-surface-container-low)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                Sürüm özeti
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  lineHeight: 1.55,
                  color: "var(--md-sys-color-on-surface-variant)",
                }}
              >
                {releasePreview}
              </pre>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>Önerilen güncelleme akışı</div>
            <pre
              style={{
                margin: 0,
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid var(--md-sys-color-outline-variant)",
                background: "var(--md-sys-color-surface-container-lowest)",
                overflowX: "auto",
                fontSize: "13px",
                lineHeight: 1.55,
              }}
            >
              {status.updateCommand}
            </pre>
          </div>

          {status.error ? (
            <div style={{ fontSize: "13px", color: "var(--md-sys-color-error)" }}>
              Güncelleme kontrolü notu: {status.error}
            </div>
          ) : null}
        </div>
      </CardContent>
      <CardActions align="start" style={{ gap: "10px", flexWrap: "wrap" }}>
        <Button type="button" variant="filled" onClick={() => void copyCommand()}>
          {copied ? "Komut kopyalandı" : "Güncelleme komutunu kopyala"}
        </Button>
        {status.releaseUrl ? (
          <a
            href={status.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="dashboard-secondary-btn"
          >
            Sürüm notlarını aç
          </a>
        ) : null}
      </CardActions>
    </Card>
  );
}
