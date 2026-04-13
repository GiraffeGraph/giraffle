import Link from "next/link";

interface PageTopbarProps {
  icon: string;
  label: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageTopbar({ icon, label, meta, actions }: PageTopbarProps) {
  return (
    <header className="page-topbar">
      <div className="page-topbar-left">
        <span className="material-symbols-outlined page-topbar-icon" aria-hidden="true">
          {icon}
        </span>

        <Link href="/dashboard" className="page-topbar-link">
          Çalışma alanı
        </Link>

        <span className="page-topbar-separator">/</span>

        <span className="page-topbar-title">{label}</span>

        {meta ? (
          <div className="page-topbar-meta">
            <span className="page-topbar-separator">/</span>
            <div className="page-topbar-meta-content">{meta}</div>
          </div>
        ) : null}
      </div>

      {actions ? <div className="page-topbar-actions">{actions}</div> : null}
    </header>
  );
}
