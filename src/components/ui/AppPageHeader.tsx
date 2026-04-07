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
    <header className="app-page-header">
      <div className="app-page-header-main">
        {eyebrow ? <div className="app-page-eyebrow">{eyebrow}</div> : null}
        <div className="app-page-header-copy">
          <h1 className="app-page-title">{title}</h1>
          {description ? <p className="app-page-subtitle">{description}</p> : null}
        </div>
      </div>

      {meta || actions ? (
        <div className="app-page-header-side">
          {meta ? <span className="app-page-badge">{meta}</span> : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
