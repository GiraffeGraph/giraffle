"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeOnboardingAction } from "@/server/api/onboarding";
import type { AppSettingKey } from "@/domain/app-settings/app-settings.types";
import styles from "./OnboardingFlow.module.css";

type StepId = "welcome" | "admin" | "ai" | "oauth" | "extras" | "finishing";

interface Props {
  settingDescriptions: Record<AppSettingKey, string>;
}

const STEP_ORDER: StepId[] = ["welcome", "admin", "ai", "oauth", "extras"];

const COPY: Record<StepId, { title: string; subtitle: string; cta: string }> = {
  welcome: {
    title: "Giraffle'a hoş geldin",
    subtitle: "Birkaç adımda hesabını ve tercih ayarlarını kuralım.",
    cta: "Başla",
  },
  admin: {
    title: "Yönetici hesabını oluştur",
    subtitle: "İlk kullanıcı bu makinede admin olur.",
    cta: "Devam",
  },
  ai: {
    title: "AI ayarları",
    subtitle: "OpenAI anahtarını girersen AI özellikleri açılır. İsteğe bağlı.",
    cta: "Devam",
  },
  oauth: {
    title: "OAuth sağlayıcıları",
    subtitle: "Trail entegrasyonları için. Tümü isteğe bağlı.",
    cta: "Devam",
  },
  extras: {
    title: "Son rötuşlar",
    subtitle: "Upload dizini ve log seviyesi. İsteğe bağlı.",
    cta: "Bitir",
  },
  finishing: {
    title: "Kurulum tamamlanıyor",
    subtitle: "Hesap oluşturuluyor ve sırlar kaydediliyor…",
    cta: "",
  },
};

export function OnboardingFlow({ settingDescriptions: _descs }: Props) {
  void _descs;
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [admin, setAdmin] = useState({ email: "", password: "", name: "" });
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBase, setOpenaiBase] = useState("");

  const [oauth, setOauth] = useState({
    TRAIL_GITHUB_CLIENT_ID: "",
    TRAIL_GITHUB_CLIENT_SECRET: "",
    TRAIL_GOOGLE_CLIENT_ID: "",
    TRAIL_GOOGLE_CLIENT_SECRET: "",
    TRAIL_NOTION_CLIENT_ID: "",
    TRAIL_NOTION_CLIENT_SECRET: "",
    TRAIL_LINEAR_CLIENT_ID: "",
    TRAIL_LINEAR_CLIENT_SECRET: "",
  });

  const [extras, setExtras] = useState({
    UPLOAD_DIR: "",
    LOG_LEVEL: "",
    APP_UPDATE_REPOSITORY: "",
  });

  const currentStep: StepId = isPending
    ? "finishing"
    : STEP_ORDER[stepIdx];

  const copy = COPY[currentStep];
  const showSteps = currentStep !== "welcome" && currentStep !== "finishing";

  function validateAdmin(): string | null {
    if (!admin.email.trim()) return "Email gerekli.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email.trim())) {
      return "Geçerli bir email gir.";
    }
    if (admin.password.length < 8) return "Şifre en az 8 karakter olmalı.";
    return null;
  }

  function next() {
    setError(null);
    if (currentStep === "admin") {
      const err = validateAdmin();
      if (err) {
        setError(err);
        return;
      }
    }
    if (stepIdx < STEP_ORDER.length - 1) {
      setStepIdx(stepIdx + 1);
    } else {
      submit();
    }
  }

  function back() {
    setError(null);
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const secrets: Partial<Record<AppSettingKey, string>> = {};
      if (openaiKey.trim()) secrets.OPENAI_API_KEY = openaiKey.trim();
      if (openaiBase.trim()) secrets.OPENAI_BASE_URL = openaiBase.trim();
      for (const [k, v] of Object.entries(oauth)) {
        if (v.trim()) secrets[k as AppSettingKey] = v.trim();
      }
      for (const [k, v] of Object.entries(extras)) {
        if (v.trim()) secrets[k as AppSettingKey] = v.trim();
      }

      const result = await completeOnboardingAction({
        admin: {
          email: admin.email.trim().toLowerCase(),
          password: admin.password,
          name: admin.name.trim() || undefined,
        },
        secrets,
      });

      if (!result.ok) {
        setError(result.error ?? "Kurulum başarısız.");
        return;
      }
      router.replace("/spotter");
      router.refresh();
    });
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !isPending) {
      e.preventDefault();
      next();
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.stage}>
        <Image
          src="/web-app-manifest-192x192.png"
          alt="Giraffle"
          width={88}
          height={88}
          priority
          className={styles.logo}
        />
        <div className={styles.heading}>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>

        {currentStep === "welcome" && (
          <div className={styles.panel} onKeyDown={onEnter}>
            <p className={styles.hint}>
              Verin makinenden çıkmaz. Tüm sırlar bu adımdan sonra
              /settings/secrets üzerinden de düzenlenebilir.
            </p>
          </div>
        )}

        {currentStep === "admin" && (
          <div className={styles.panel} onKeyDown={onEnter}>
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                type="email"
                value={admin.email}
                placeholder="you@example.com"
                onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Şifre</label>
              <input
                className={styles.input}
                type="password"
                value={admin.password}
                placeholder="En az 8 karakter"
                onChange={(e) =>
                  setAdmin({ ...admin, password: e.target.value })
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>İsim (opsiyonel)</label>
              <input
                className={styles.input}
                type="text"
                value={admin.name}
                placeholder="Yahya"
                onChange={(e) => setAdmin({ ...admin, name: e.target.value })}
              />
            </div>
          </div>
        )}

        {currentStep === "ai" && (
          <div className={styles.panel} onKeyDown={onEnter}>
            <div className={styles.field}>
              <label className={styles.label}>OpenAI API Key</label>
              <input
                className={styles.input}
                type="password"
                value={openaiKey}
                placeholder="sk-..."
                onChange={(e) => setOpenaiKey(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>OpenAI Base URL (opsiyonel)</label>
              <input
                className={styles.input}
                type="text"
                value={openaiBase}
                placeholder="https://api.openai.com/v1"
                onChange={(e) => setOpenaiBase(e.target.value)}
              />
            </div>
            <p className={styles.skip}>Boş geçebilirsin, sonra eklersin.</p>
          </div>
        )}

        {currentStep === "oauth" && (
          <div className={styles.panel} onKeyDown={onEnter}>
            {(["GITHUB", "GOOGLE", "NOTION", "LINEAR"] as const).map(
              (provider) => {
                const idKey =
                  `TRAIL_${provider}_CLIENT_ID` as keyof typeof oauth;
                const secretKey =
                  `TRAIL_${provider}_CLIENT_SECRET` as keyof typeof oauth;
                return (
                  <div key={provider} style={{ display: "grid", gap: 8 }}>
                    <p className={styles.sectionTitle}>{provider}</p>
                    <div className={styles.field}>
                      <input
                        className={styles.input}
                        type="text"
                        value={oauth[idKey]}
                        placeholder="Client ID"
                        onChange={(e) =>
                          setOauth({ ...oauth, [idKey]: e.target.value })
                        }
                      />
                    </div>
                    <div className={styles.field}>
                      <input
                        className={styles.input}
                        type="password"
                        value={oauth[secretKey]}
                        placeholder="Client Secret"
                        onChange={(e) =>
                          setOauth({ ...oauth, [secretKey]: e.target.value })
                        }
                      />
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}

        {currentStep === "extras" && (
          <div className={styles.panel} onKeyDown={onEnter}>
            <div className={styles.field}>
              <label className={styles.label}>Upload dizini</label>
              <input
                className={styles.input}
                type="text"
                value={extras.UPLOAD_DIR}
                placeholder="/absolute/path/to/uploads (opsiyonel)"
                onChange={(e) =>
                  setExtras({ ...extras, UPLOAD_DIR: e.target.value })
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Log seviyesi</label>
              <input
                className={styles.input}
                type="text"
                value={extras.LOG_LEVEL}
                placeholder="debug, info, warn, error (varsayılan: info)"
                onChange={(e) =>
                  setExtras({ ...extras, LOG_LEVEL: e.target.value })
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Update repository</label>
              <input
                className={styles.input}
                type="text"
                value={extras.APP_UPDATE_REPOSITORY}
                placeholder="owner/repo (opsiyonel)"
                onChange={(e) =>
                  setExtras({
                    ...extras,
                    APP_UPDATE_REPOSITORY: e.target.value,
                  })
                }
              />
            </div>
          </div>
        )}

        {currentStep === "finishing" && (
          <div className={styles.panel}>
            <div className={styles.launching}>
              <div className={styles.spinner} />
              <p className={styles.hint}>Lütfen bekle…</p>
            </div>
          </div>
        )}

        <div className={styles.error}>{error ?? ""}</div>

        {currentStep !== "finishing" && (
          <div className={styles.footer}>
            <div className={styles.steps}>
              {showSteps &&
                STEP_ORDER.slice(1).map((_, i) => (
                  <span
                    key={i}
                    className={[
                      styles.stepDot,
                      i + 1 <= stepIdx ? styles.active : "",
                    ].join(" ")}
                  />
                ))}
            </div>
            <div className={styles.actions}>
              {stepIdx > 0 && (
                <button
                  type="button"
                  className={[styles.btn, styles.ghost].join(" ")}
                  onClick={back}
                  disabled={isPending}
                >
                  Geri
                </button>
              )}
              <button
                type="button"
                className={[styles.btn, styles.primary].join(" ")}
                onClick={next}
                disabled={isPending}
              >
                {copy.cta}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
