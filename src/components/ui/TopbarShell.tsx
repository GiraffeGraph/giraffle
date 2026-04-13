import clsx from "clsx";

interface TopbarShellProps {
  left: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  onContextMenu?: React.MouseEventHandler<HTMLElement>;
}

export function TopbarShell({ left, right, className, onContextMenu }: TopbarShellProps) {
  return (
    <header className={clsx("topbar-shell", className)} onContextMenu={onContextMenu}>
      <div className="topbar-shell-main">{left}</div>
      {right ? <div className="topbar-shell-actions">{right}</div> : null}
    </header>
  );
}
