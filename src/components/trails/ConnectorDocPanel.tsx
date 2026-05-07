"use client";

import { useSyncExternalStore } from "react";
import {
  CONNECTOR_DOCS,
  type ConnectorDoc,
} from "@/domain/trail/connector-docs";
import type { TrailKind } from "@/domain/trail/trail.types";

interface Props {
  kind: TrailKind;
  variant: "full" | "compact";
}

const subscribeNoop = () => () => {};
const getOrigin = () =>
  typeof window === "undefined" ? "" : window.location.origin;
const getOriginServer = () => "";

function useOrigin(): string {
  return useSyncExternalStore(subscribeNoop, getOrigin, getOriginServer);
}

export function ConnectorDocPanel({ kind, variant }: Props) {
  const doc: ConnectorDoc = CONNECTOR_DOCS[kind];
  const origin = useOrigin();
  const callbackUrl = doc.callbackPathTemplate
    ? origin
      ? `${origin}${doc.callbackPathTemplate}`
      : doc.callbackPathTemplate
    : null;

  if (variant === "compact") {
    return (
      <div style={{ fontSize: 11, opacity: 0.85, display: "grid", gap: 4 }}>
        <p style={{ margin: 0 }}>{doc.oneLiner}</p>
        {doc.tools.length > 0 && (
          <details style={{ marginTop: 2 }}>
            <summary style={{ cursor: "pointer", opacity: 0.8 }}>
              {doc.tools.length} tool{doc.tools.length === 1 ? "" : "s"}
            </summary>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {doc.tools.map((t) => (
                <li key={t.name}>
                  <code style={{ fontSize: 11 }}>{t.name}</code>
                  {t.destructive ? " · destructive" : ""} — {t.description}
                </li>
              ))}
            </ul>
          </details>
        )}
        {doc.signupUrl && (
          <a
            href={doc.signupUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11 }}
          >
            {doc.signupLabel ?? "Provider docs"} ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <section
      style={{
        border: "1px solid var(--md-sys-color-outline-variant)",
        borderRadius: 12,
        padding: 12,
        background: "var(--md-sys-color-surface-container-low)",
        display: "grid",
        gap: 10,
        fontSize: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          info
        </span>
        <strong style={{ fontSize: 13 }}>About this Trail</strong>
        {doc.signupUrl && (
          <a
            href={doc.signupUrl}
            target="_blank"
            rel="noreferrer"
            style={{ marginLeft: "auto", fontSize: 12 }}
          >
            {doc.signupLabel ?? "Provider docs"} ↗
          </a>
        )}
      </header>

      <p style={{ margin: 0, opacity: 0.85 }}>{doc.oneLiner}</p>

      <div>
        <strong style={{ fontSize: 12 }}>Setup</strong>
        <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {doc.setupSteps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
      </div>

      {(doc.envVars?.length || callbackUrl || doc.scopes?.length) && (
        <div style={{ display: "grid", gap: 6 }}>
          <strong style={{ fontSize: 12 }}>Server config</strong>
          {doc.envVars?.length ? (
            <div>
              <span style={{ opacity: 0.7 }}>Env vars:</span>{" "}
              {doc.envVars.map((v) => (
                <code key={v} style={codeStyle}>
                  {v}
                </code>
              ))}
            </div>
          ) : null}
          {callbackUrl && (
            <div>
              <span style={{ opacity: 0.7 }}>Redirect URI:</span>{" "}
              <code style={codeStyle}>{callbackUrl}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(callbackUrl)}
                style={copyBtnStyle}
                aria-label="Copy redirect URI"
              >
                Copy
              </button>
            </div>
          )}
          {doc.scopes?.length ? (
            <div>
              <span style={{ opacity: 0.7 }}>Scopes:</span>{" "}
              {doc.scopes.map((s) => (
                <code key={s} style={codeStyle}>
                  {s}
                </code>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {doc.tools.length > 0 && (
        <div>
          <strong style={{ fontSize: 12 }}>Tools provided</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {doc.tools.map((t) => (
              <li key={t.name}>
                <code style={{ fontSize: 11 }}>{t.name}</code>
                {t.destructive && (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: "1px 6px",
                      borderRadius: 6,
                      background: "var(--md-sys-color-error-container)",
                      color: "var(--md-sys-color-on-error-container)",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    destructive
                  </span>
                )}
                <div style={{ opacity: 0.75 }}>{t.description}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {doc.notes?.length ? (
        <div>
          <strong style={{ fontSize: 12 }}>Notes</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {doc.notes.map((n, idx) => (
              <li key={idx} style={{ opacity: 0.85 }}>
                {n}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const codeStyle: React.CSSProperties = {
  padding: "1px 5px",
  borderRadius: 4,
  background: "var(--md-sys-color-surface-container)",
  fontSize: 11,
  marginRight: 4,
};

const copyBtnStyle: React.CSSProperties = {
  marginLeft: 6,
  padding: "2px 8px",
  borderRadius: 6,
  border: "1px solid var(--md-sys-color-outline-variant)",
  background: "transparent",
  fontSize: 11,
  cursor: "pointer",
};
