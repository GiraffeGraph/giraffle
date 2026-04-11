"use client";

import { useCallback, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GraphIcon } from "@/components/sidebar/GraphIcon";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { useIsMobileViewport } from "@/components/ui/useIsMobileViewport";
import { signOutAction } from "@/server/api/auth";
import {
  APP_THEME_STORAGE_KEY,
  DEFAULT_APP_THEME,
  persistAppTheme,
} from "@/components/theme/theme-config";
import {
  SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_COMPACT_STORAGE_KEY,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
} from "@/lib/workspace-preferences";

type RightRailProps = {
  user: { name: string | null; email: string | null };
};

const NAV_ITEMS = [
  { path: "/search", icon: "\uE8B6", label: "Arama" },
  { path: "/templates", icon: "\uE02F", label: "Şablonlar" },
  { path: "/publish", icon: "\uE255", label: "Yayın" },
  { path: "/proposals", icon: "\uE65F", label: "Öneriler" },
  { path: "/settings", icon: "\uE8B8", label: "Ayarlar" },
  { path: "/account", icon: "\uF20B", label: "Hesap" },
] as const;

export function RightRail({ user }: RightRailProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport(900);
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const handleResetPreferences = useCallback(() => {
    window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_COMPACT_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    persistAppTheme(DEFAULT_APP_THEME);
    window.location.reload();
  }, []);

  const menuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        label: "Tercihleri sıfırla",
        hint: "Tema ve sidebar tercihlerini varsayılana al",
        onSelect: handleResetPreferences,
      },
      {
        label: "Çıkış yap",
        hint: "Oturumu kapat",
        tone: "danger" as const,
        onSelect: () => void signOutAction(),
      },
    ],
    [handleResetPreferences],
  );

  const openMenu = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenuPos({ x: rect.left - 8, y: rect.top });
  }, []);

  const userInitial = (user.name ?? user.email ?? "G")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="right-rail">
      {/* Graf */}
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

      {/* İkincil navigasyon ikonları */}
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

      {/* Alt: tema seçici + kullanıcı */}
      <div className="right-rail-bottom">
        <ThemeSelector vertical={!isMobileViewport} />
        <button
          type="button"
          className="right-rail-avatar"
          onClick={openMenu}
          aria-label="Hesap menüsü"
          title={user.name ?? user.email ?? "Kullanıcı"}
        >
          {userInitial}
        </button>
      </div>

      <ContextMenu
        items={menuItems}
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
      />
    </div>
  );
}
