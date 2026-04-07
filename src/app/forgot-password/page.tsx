"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/server/api/auth";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    const response = await requestPasswordResetAction(
      String(formData.get("email") ?? "")
    );
    setMessage(response.message);
    setIsLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">G</span>
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-subtitle">
            If an account exists, we&apos;ll prepare a reset link for it.
          </p>
        </div>

        <form action={handleSubmit} className="auth-form">
          {message ? <div className="auth-error">{message}</div> : null}
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoFocus />
          </div>
          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? "Preparing..." : "Request reset link"}
          </button>
        </form>

        <div className="auth-footer">
          <Link href="/login" className="auth-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
