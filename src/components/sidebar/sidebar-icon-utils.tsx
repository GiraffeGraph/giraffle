import type { CSSProperties, ReactNode } from "react";

export const MATERIAL_SYMBOL_PREFIX = "ms:";

export const SIDEBAR_ICON_EMOJI_SECTIONS = [
  {
    label: "People",
    icons: ["😀", "😄", "😁", "😎", "🥳", "🤔", "😍", "😴", "🥲", "😶", "🤝", "🙌"],
  },
  {
    label: "Nature",
    icons: ["🌱", "🌿", "🍀", "🌵", "🌸", "🌻", "🌕", "☀️", "🌧️", "🔥", "🌊", "⛰️"],
  },
  {
    label: "Objects",
    icons: ["📌", "📎", "📁", "📚", "🧠", "💡", "🛠️", "🧩", "🎯", "🧪", "🗂️", "🧭"],
  },
  {
    label: "Places",
    icons: ["🏠", "🏢", "🏫", "🌆", "✈️", "🚀", "🚲", "🛵", "🚗", "🛰️", "🗺️", "🏝️"],
  },
] as const;

export const SIDEBAR_ICON_MATERIAL_SYMBOLS = [
  "description",
  "folder",
  "folder_open",
  "draft",
  "sticky_note_2",
  "book_2",
  "auto_awesome",
  "lightbulb",
  "bolt",
  "rocket_launch",
  "target",
  "timer",
  "event",
  "check_circle",
  "radio_button_checked",
  "pending",
  "schedule",
  "notifications",
  "sell",
  "label",
  "bookmark",
  "bookmark_manager",
  "star",
  "favorite",
  "flag",
  "push_pin",
  "explore",
  "travel",
  "flight",
  "directions_car",
  "home",
  "apartment",
  "storefront",
  "payments",
  "monitoring",
  "trending_up",
  "bar_chart",
  "query_stats",
  "database",
  "cloud",
  "cloud_done",
  "hub",
  "lan",
  "memory",
  "computer",
  "terminal",
  "code",
  "code_blocks",
  "api",
  "sdk",
  "deployed_code",
  "science",
  "biotech",
  "architecture",
  "manufacturing",
  "build",
  "construction",
  "palette",
  "brush",
  "design_services",
  "image",
  "movie",
  "music_note",
  "mic",
  "podcasts",
  "sports_soccer",
  "fitness_center",
  "restaurant",
  "local_cafe",
  "shopping_bag",
  "inventory_2",
  "box",
  "newspaper",
  "history",
  "search",
  "insights",
  "globe",
  "public",
  "lock",
  "lock_open",
  "shield",
  "verified",
  "warning",
  "bug_report",
  "pets",
  "ac_unit",
  "forest",
  "water_drop",
  "psychiatry",
] as const;

export function encodeMaterialSymbol(name: string) {
  return `${MATERIAL_SYMBOL_PREFIX}${name}`;
}

export function decodeStoredIcon(icon: string | null | undefined) {
  if (!icon) {
    return { kind: null, value: null };
  }

  if (icon.startsWith(MATERIAL_SYMBOL_PREFIX)) {
    return {
      kind: "material",
      value: icon.slice(MATERIAL_SYMBOL_PREFIX.length),
    };
  }

  return { kind: "emoji", value: icon };
}

export function renderStoredIcon(
  icon: string | null | undefined,
  options?: {
    fallback?: ReactNode;
    materialClassName?: string;
    emojiClassName?: string;
    emojiStyle?: CSSProperties;
  }
) {
  const decoded = decodeStoredIcon(icon);

  if (decoded.kind === "material" && decoded.value) {
    return (
      <span
        className={options?.materialClassName ?? "material-symbols-outlined sm"}
        aria-hidden="true"
      >
        {decoded.value}
      </span>
    );
  }

  if (decoded.kind === "emoji" && decoded.value) {
    return (
      <span
        className={options?.emojiClassName}
        style={options?.emojiStyle ?? { fontSize: "14px", lineHeight: 1 }}
        aria-hidden="true"
      >
        {decoded.value}
      </span>
    );
  }

  return options?.fallback ?? null;
}
