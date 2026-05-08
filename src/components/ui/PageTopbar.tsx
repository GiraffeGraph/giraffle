import Link from "next/link";
import { TopbarShell } from "@/components/ui/TopbarShell";

interface PageTopbarProps {
  icon: string;
  label: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageTopbar({ icon, label, meta, actions }: PageTopbarProps) {
  return (
    <TopbarShell
      left={
        <>
          <span className="material-symbols-outlined page-topbar-icon" aria-hidden="true">
            {icon}
          </span>
          <Link href="/spotter" className="page-topbar-link">
            Workspace
          </Link>
          <span className="page-topbar-separator">/</span>
          <span className="page-topbar-title">{label}</span>
          {meta ? (
            <div className="page-topbar-meta">
              <span className="page-topbar-separator">/</span>
              <div className="page-topbar-meta-content">{meta}</div>
            </div>
          ) : null}
        </>
      }
      right={actions}
    />
  );
}
