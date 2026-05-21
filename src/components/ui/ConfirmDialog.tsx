"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let pushRequest: ((req: ConfirmRequest) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushRequest) {
      resolve(typeof window !== "undefined" ? window.confirm(options.message) : false);
      return;
    }
    pushRequest({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    pushRequest = (req) => setRequest(req);
    return () => {
      pushRequest = null;
    };
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      request?.resolve(ok);
      setRequest(null);
    },
    [request],
  );

  useEffect(() => {
    if (!request) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [request, close]);

  if (!request) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="confirm-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div className="confirm-dialog">
        {request.title ? (
          <h2 id="confirm-dialog-title" className="confirm-dialog-title">
            {request.title}
          </h2>
        ) : null}
        <p className="confirm-dialog-message">{request.message}</p>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-btn"
            onClick={() => close(false)}
          >
            {request.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={`confirm-dialog-btn confirm-dialog-btn-primary${
              request.destructive ? " danger" : ""
            }`}
            onClick={() => close(true)}
          >
            {request.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
