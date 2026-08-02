"use client";

import { useSyncExternalStore } from "react";

export type TabKind = "note" | "savanna" | "page";

function isTabKind(value: unknown): value is TabKind {
  return value === "note" || value === "savanna" || value === "page";
}

export interface EditorTab {
  key: string;
  kind: TabKind;
  href: string;
  title: string;
  icon: string | null;
  pinned?: boolean;
  dirty?: boolean;
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

function trimRespectingPinned(tabs: EditorTab[]): EditorTab[] {
  if (tabs.length <= MAX_TABS) return tabs;
  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);
  const room = Math.max(0, MAX_TABS - pinned.length);
  return [...pinned, ...unpinned.slice(-room)];
}

function emit() {
  cachedSnapshot = state;
  for (const l of listeners) l();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const sanitized: EditorTabsState = {
      activeKey: state.activeKey,
      tabs: state.tabs.map(({ dirty: _dirty, ...rest }) => rest),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
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
          isTabKind((t as EditorTab).kind),
      )
      .slice(0, MAX_TABS);
    const activeKey =
      typeof parsed.activeKey === "string" &&
      tabs.some((tab) => tab.key === parsed.activeKey)
        ? parsed.activeKey
        : null;
    state = { tabs, activeKey };
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
          ? {
              ...t,
              title: tab.title,
              icon: tab.icon,
              href: tab.href,
              kind: tab.kind,
            }
          : t,
      );
      setState({ tabs, activeKey: tab.key });
      return;
    }
    const next = [...state.tabs, tab];
    const trimmed = next.length > MAX_TABS ? trimRespectingPinned(next) : next;
    setState({ tabs: trimmed, activeKey: tab.key });
  },

  togglePin(key: string) {
    hydrate();
    const updated = state.tabs.map((t) =>
      t.key === key ? { ...t, pinned: !t.pinned } : t,
    );
    const pinned = updated.filter((t) => t.pinned);
    const unpinned = updated.filter((t) => !t.pinned);
    setState({ tabs: [...pinned, ...unpinned], activeKey: state.activeKey });
  },

  closeOthers(key: string) {
    hydrate();
    const tabs = state.tabs.filter((t) => t.key === key || t.pinned);
    setState({ tabs, activeKey: key });
  },

  closeAll() {
    hydrate();
    const tabs = state.tabs.filter((t) => t.pinned);
    setState({
      tabs,
      activeKey: tabs.find((t) => t.key === state.activeKey)?.key ?? null,
    });
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

  setDirty(key: string, dirty: boolean) {
    hydrate();
    const existing = state.tabs.find((t) => t.key === key);
    if (!existing || !!existing.dirty === dirty) return;
    const tabs = state.tabs.map((t) =>
      t.key === key ? { ...t, dirty } : t,
    );
    setState({ tabs, activeKey: state.activeKey });
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
    const moved = state.tabs[from];
    const pinnedCount = state.tabs.filter((t) => t.pinned).length;
    const min = moved.pinned ? 0 : pinnedCount;
    const max = moved.pinned ? pinnedCount - 1 : state.tabs.length - 1;
    const clamped = Math.max(min, Math.min(max, toIndex));
    if (from === clamped) return;
    const tabs = [...state.tabs];
    tabs.splice(from, 1);
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
  page: "tab",
};
