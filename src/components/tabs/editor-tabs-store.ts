"use client";

import { useSyncExternalStore } from "react";

export type TabKind = "note" | "savanna" | "spotter" | "page";

export interface EditorTab {
  key: string;
  kind: TabKind;
  href: string;
  title: string;
  icon: string | null;
}

interface EditorTabsState {
  tabs: EditorTab[];
  activeKey: string | null;
}

const STORAGE_KEY = "giraffle.editor-tabs.v2";
const MAX_TABS = 20;
const CLOSED_MAX = 10;

const EMPTY_STATE: EditorTabsState = { tabs: [], activeKey: null };
const listeners = new Set<() => void>();
let state: EditorTabsState = EMPTY_STATE;
let cachedSnapshot: EditorTabsState = state;
let hydrated = false;
const closedStack: EditorTab[] = [];

function emit() {
  cachedSnapshot = state;
  for (const l of listeners) l();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<EditorTabsState> | null;
    if (!parsed || !Array.isArray(parsed.tabs)) return;
    const tabs = parsed.tabs
      .filter(
        (t): t is EditorTab =>
          !!t &&
          typeof t === "object" &&
          typeof (t as EditorTab).key === "string" &&
          typeof (t as EditorTab).href === "string" &&
          typeof (t as EditorTab).title === "string" &&
          typeof (t as EditorTab).kind === "string",
      )
      .slice(0, MAX_TABS);
    state = {
      tabs,
      activeKey:
        typeof parsed.activeKey === "string" ? parsed.activeKey : null,
    };
    cachedSnapshot = state;
  } catch {}
}

function setState(next: EditorTabsState) {
  if (next === state) return;
  state = next;
  persist();
  emit();
}

export const editorTabsStore = {
  subscribe(listener: () => void) {
    hydrate();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): EditorTabsState {
    hydrate();
    return cachedSnapshot;
  },

  getServerSnapshot(): EditorTabsState {
    return EMPTY_STATE;
  },

  openTab(tab: EditorTab) {
    hydrate();
    const existing = state.tabs.find((t) => t.key === tab.key);
    if (existing) {
      const sameMeta =
        existing.title === tab.title &&
        existing.icon === tab.icon &&
        existing.href === tab.href &&
        existing.kind === tab.kind;
      if (sameMeta && state.activeKey === tab.key) return;
      const tabs = state.tabs.map((t) =>
        t.key === tab.key
          ? { ...t, title: tab.title, icon: tab.icon, href: tab.href, kind: tab.kind }
          : t,
      );
      setState({ tabs, activeKey: tab.key });
      return;
    }
    const tabs = [...state.tabs, tab].slice(-MAX_TABS);
    setState({ tabs, activeKey: tab.key });
  },

  closeTab(key: string): { next: EditorTab | null } {
    hydrate();
    const idx = state.tabs.findIndex((t) => t.key === key);
    if (idx === -1)
      return { next: state.tabs.find((t) => t.key === state.activeKey) ?? null };
    const closed = state.tabs[idx];
    closedStack.push(closed);
    if (closedStack.length > CLOSED_MAX) closedStack.shift();
    const tabs = state.tabs.filter((t) => t.key !== key);
    let activeKey = state.activeKey;
    let next: EditorTab | null = null;
    if (activeKey === key) {
      next = tabs[idx] ?? tabs[idx - 1] ?? null;
      activeKey = next?.key ?? null;
    } else {
      next = tabs.find((t) => t.key === activeKey) ?? null;
    }
    setState({ tabs, activeKey });
    return { next };
  },

  setActive(key: string | null) {
    hydrate();
    if (state.activeKey === key) return;
    setState({ ...state, activeKey: key });
  },

  reorderTab(key: string, toIndex: number) {
    hydrate();
    const from = state.tabs.findIndex((t) => t.key === key);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(state.tabs.length - 1, toIndex));
    if (from === clamped) return;
    const tabs = [...state.tabs];
    const [moved] = tabs.splice(from, 1);
    tabs.splice(clamped, 0, moved);
    setState({ tabs, activeKey: state.activeKey });
  },

  popClosed(): EditorTab | null {
    return closedStack.pop() ?? null;
  },

  getActiveKey(): string | null {
    hydrate();
    return state.activeKey;
  },

  getTabs(): EditorTab[] {
    hydrate();
    return state.tabs;
  },
};

export function useEditorTabs(): EditorTabsState {
  return useSyncExternalStore(
    editorTabsStore.subscribe,
    editorTabsStore.getSnapshot,
    editorTabsStore.getServerSnapshot,
  );
}

export const DEFAULT_KIND_ICON: Record<TabKind, string> = {
  note: "description",
  savanna: "polyline",
  spotter: "smart_toy",
  page: "tab",
};
