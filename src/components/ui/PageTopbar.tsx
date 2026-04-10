"use client";

import Link from "next/link";
import { TopbarPathNavigator } from "./TopbarPathNavigator";

interface PageTopbarProps {
  icon: string;
  label: string;
  currentPath: string;
  actions?: React.ReactNode;
}

export function PageTopbar({ icon, label, currentPath, actions }: PageTopbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        height: "36px",
        padding: "0 16px",
        borderBottom: "1px solid var(--md-sys-color-outline-variant)",
        fontSize: "12px",
        color: "var(--md-sys-color-on-surface-variant)",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--shell-main-bg, var(--md-sys-color-surface))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, overflow: "hidden" }}>
        <span className="material-symbols-outlined" style={{ fontSize: "16px", flexShrink: 0 }} aria-hidden="true">
          {icon}
        </span>
        <Link
          href="/dashboard"
          style={{ color: "inherit", textDecoration: "none", padding: "2px 4px", borderRadius: "4px", fontSize: "12px", whiteSpace: "nowrap" }}
        >
          Çalışma alanı
        </Link>
        <span style={{ opacity: 0.4 }}>/</span>
        <span style={{ color: "var(--md-sys-color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </div>

      <div style={{ flex: "0 1 320px", minWidth: 0 }}>
        <TopbarPathNavigator currentPath={currentPath} />
      </div>

      {actions ? (
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
