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
      setMessage("Password updated. You can sign in now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }

    setIsLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">G</span>
          <h1 className="auth-title">Set a new password</h1>
          <p className="auth-subtitle">
            {tokenState.valid
              ? `Set a new password for ${tokenState.email ?? "this account"}.`
              : "This reset link is no longer valid."}
          </p>
        </div>

        {tokenState.valid ? (
          <form action={handleSubmit} className="auth-form">
            {message ? <div className="auth-error">{message}</div> : null}
            <div className="auth-field">
              <label htmlFor="password">New password</label>
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
              {isLoading ? "Saving..." : "Update password"}
            </button>
          </form>
        ) : (
          <div className="auth-footer">
            <Link href="/forgot-password" className="auth-link">
              Request a new reset link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
