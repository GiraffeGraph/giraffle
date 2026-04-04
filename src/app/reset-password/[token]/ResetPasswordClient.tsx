"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/server/api/auth";

interface ResetPasswordClientProps {
  token: string;
  tokenState: {
    valid: boolean;
    email: string | null;
  };
}

export function ResetPasswordClient({
  token,
  tokenState,
}: ResetPasswordClientProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);

    try {
      await resetPasswordAction({
        token,
        nextPassword: String(formData.get("password") ?? ""),
      });
      setMessage("Sifre guncellendi. Artik giris yapabilirsin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bir hata olustu.");
    }

    setIsLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">G</span>
          <h1 className="auth-title">Yeni sifre belirle</h1>
          <p className="auth-subtitle">
            {tokenState.valid
              ? `${tokenState.email ?? "Hesap"} icin yeni sifre ayarla.`
              : "Bu sifirlama baglantisi artik gecerli degil."}
          </p>
        </div>

        {tokenState.valid ? (
          <form action={handleSubmit} className="auth-form">
            {message ? <div className="auth-error">{message}</div> : null}
            <div className="auth-field">
              <label htmlFor="password">Yeni sifre</label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="auth-submit" disabled={isLoading}>
              {isLoading ? "Kaydediliyor..." : "Sifreyi guncelle"}
            </button>
          </form>
        ) : (
          <div className="auth-footer">
            <Link href="/forgot-password" className="auth-link">
              Yeni reset iste
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
