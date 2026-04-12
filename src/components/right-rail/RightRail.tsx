"use client";

import { usePathname, useRouter } from "next/navigation";
import { GraphIcon } from "@/components/sidebar/GraphIcon";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { signOutAction } from "@/server/api/auth";

const NAV_ITEMS = [
  { path: "/search", icon: "\uE8B6", label: "Arama" },
  { path: "/discover", icon: "newspaper", label: "Keşfet" },
  { path: "/templates", icon: "\uE02F", label: "Şablonlar" },
  { path: "/publish", icon: "\uE255", label: "Yayın" },
  { path: "/proposals", icon: "\uE65F", label: "Öneriler" },
  { path: "/archive", icon: "inventory_2", label: "Arşiv" },
  { path: "/settings", icon: "\uE8B8", label: "Ayarlar" },
  { path: "/account", icon: "\uF20B", label: "Hesap" },
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
        aria-label="Bağlantı ağı"
        title="Bağlantı ağı"
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
          aria-label="Çıkış yap"
          title="Çıkış yap"
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
