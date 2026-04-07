import type { ReactNode } from "react";

export type SidebarGroupAction = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 150ms ease",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function SidebarGroup({
  label,
  icon,
  meta,
  collapsed = false,
  collapsible = true,
  showChevron = true,
  onToggle,
  actions,
  children,
}: {
  label: string;
  /** Etiketin solunda görünecek ikon */
  icon?: ReactNode;
  meta?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  showChevron?: boolean;
  onToggle?: () => void;
  /** VS Code tarzı hover ikonları — her biri bir aksiyon butonudur */
  actions?: SidebarGroupAction[];
  children: ReactNode;
}) {
  return (
    <section className={`sidebar-group ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-group-head">
        {collapsible ? (
          <button
            type="button"
            className="sidebar-item sidebar-group-toggle"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            {showChevron ? <ChevronIcon open={!collapsed} /> : null}
            {icon ? <span className="sidebar-item-icon sidebar-group-icon">{icon}</span> : null}
            <span className="sidebar-item-label sidebar-group-label">{label}</span>
          </button>
        ) : (
          <div className="sidebar-item sidebar-group-title">
            {icon ? <span className="sidebar-item-icon sidebar-group-icon">{icon}</span> : null}
            <span className="sidebar-item-label sidebar-group-label">{label}</span>
          </div>
        )}
        <div className="sidebar-group-actions">
          {meta ? <span className="sidebar-group-meta">{meta}</span> : null}
          {actions?.map((action) => (
            <button
              key={action.label}
              type="button"
              className="sidebar-group-action"
              onClick={action.onClick}
              aria-label={action.label}
              title={action.label}
            >
              {action.icon}
            </button>
          ))}
        </div>
      </div>
      {!collapsed ? <div className="sidebar-group-body">{children}</div> : null}
    </section>
  );
}
