import type { ReactNode } from "react";

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function SidebarGroup({
  label,
  meta,
  collapsed = false,
  collapsible = true,
  onToggle,
  onAdd,
  children,
}: {
  label: string;
  meta?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  onToggle?: () => void;
  onAdd?: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`sidebar-group ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-group-head">
        {collapsible ? (
          <button
            type="button"
            className="sidebar-group-toggle"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            <span className={`sidebar-group-caret ${collapsed ? "collapsed" : ""}`}>▾</span>
            <span className="sidebar-group-label">{label}</span>
          </button>
        ) : (
          <div className="sidebar-group-title">
            <span className="sidebar-group-label">{label}</span>
          </div>
        )}
        <div className="sidebar-group-actions">
          {meta ? <span className="sidebar-group-meta">{meta}</span> : null}
          {onAdd ? (
            <button
              type="button"
              className="sidebar-group-add"
              onClick={onAdd}
              aria-label={`${label} ekle`}
            >
              <PlusIcon />
            </button>
          ) : null}
        </div>
      </div>
      {!collapsed ? <div className="sidebar-group-body">{children}</div> : null}
    </section>
  );
}
