"use client";

import Link from "next/link";
import { useState } from "react";
import { registerAction } from "@/server/api/auth";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);
    const result = await registerAction(formData);
    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">G</span>
          <h1 className="auth-title">Hesabını oluştur</h1>
          <p className="auth-subtitle">Bilgi ağını kurmaya başla</p>
        </div>

        <form action={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label htmlFor="name">Ad</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Adın"
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label htmlFor="email">E-posta</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Şifre</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="En az 8 karakter"
              required
              minLength={8}
            />
          </div>

          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? "Hesap oluşturuluyor..." : "Hesap Oluştur"}
          </button>
        </form>

        <div className="auth-footer">
          <span>Zaten hesabın var mı?</span>
          <Link href="/login" className="auth-link">
            Giriş yap
          </Link>
        </div>
      </div>
    </div>
  );
}
