interface AppPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: string;
  actions?: React.ReactNode;
}

export function AppPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: AppPageHeaderProps) {
  return (
    <header style={{ padding: "32px 32px 48px", maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "24px", color: "var(--md-sys-color-on-background)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1 1 auto", minWidth: "280px" }}>
        {eyebrow ? (
          <div style={{ fontSize: "var(--md-sys-typescale-label-medium-size)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", color: "var(--md-sys-color-primary)" }}>
            {eyebrow}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h1 className="md-typescale-display-small" style={{ margin: 0, fontWeight: "bold" }}>{title}</h1>
          {description ? (
            <p className="md-typescale-body-large" style={{ margin: 0, color: "var(--md-sys-color-on-surface-variant)", maxWidth: "600px" }}>
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {meta || actions ? (
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {meta ? (
            <span style={{ padding: "6px 12px", background: "var(--md-sys-color-secondary-container)", color: "var(--md-sys-color-on-secondary-container)", borderRadius: "var(--md-sys-shape-full)", fontSize: "var(--md-sys-typescale-label-large-size)", fontWeight: "500" }}>
              {meta}
            </span>
          ) : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
