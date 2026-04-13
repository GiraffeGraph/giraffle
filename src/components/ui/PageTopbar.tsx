import Link from "next/link";

interface PageTopbarProps {
  icon: string;
  label: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageTopbar({ icon, label, meta, actions }: PageTopbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        minHeight: "36px",
        padding: "0 12px 0 16px",
        borderBottom: "1px solid var(--md-sys-color-outline-variant)",
        fontSize: "12px",
        color: "var(--md-sys-color-on-surface-variant)",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "color-mix(in srgb, var(--shell-main-bg, var(--md-sys-color-surface)) 92%, transparent)",
        backdropFilter: "blur(12px)",
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
        <span style={{ color: "var(--md-sys-color-on-surface)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
          {label}
        </span>
        {meta ? (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden" }}>
            <span style={{ opacity: 0.25 }}>/</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden" }}>{meta}</div>
          </div>
        ) : null}
      </div>

      {actions ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
