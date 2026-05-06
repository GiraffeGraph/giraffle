"use client";

import { usePathname, useRouter } from "next/navigation";
import { GraphIcon } from "@/components/sidebar/GraphIcon";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { signOutAction } from "@/server/api/auth";

const NAV_ITEMS = [
  { path: "/search", icon: "\uE8B6", label: "Search" },
  { path: "/publish", icon: "\uE255", label: "Publish" },
  { path: "/trails", icon: "route", label: "Trails" },
  { path: "/archive", icon: "inventory_2", label: "Archive" },
  { path: "/settings", icon: "\uE8B8", label: "Settings" },
  { path: "/account", icon: "\uF20B", label: "Account" },
] as const;

export function RightRail() {
  const pathname = usePathname();
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport(900);

  return (
    <div className="right-rail">
      <button
        type="button"
        className={`right-rail-btn${pathname === "/graph" ? " active" : ""}`}
        onClick={() => router.push("/graph")}
        aria-label="Connection graph"
        title="Connection graph"
      >
        <GraphIcon size={18} />
      </button>

      <div className="right-rail-divider" />

      {NAV_ITEMS.map(({ path, icon, label }) => (
        <button
          key={path}
          type="button"
          className={`right-rail-btn${pathname === path || pathname.startsWith(`${path}/`) ? " active" : ""}`}
          onClick={() => router.push(path)}
          aria-label={label}
          title={label}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px", lineHeight: 1 }}
          >
            {icon}
          </span>
        </button>
      ))}

      <div className="right-rail-bottom">
        {!isMobileViewport ? <ThemeSelector vertical /> : null}
        <button
          type="button"
          className="right-rail-btn right-rail-btn--signout"
          onClick={() => void signOutAction()}
          aria-label="Sign out"
          title="Sign out"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px", lineHeight: 1 }}
          >
            logout
          </span>
        </button>
      </div>
    </div>
  );
}
