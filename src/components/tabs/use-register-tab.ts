"use client";

import { useEffect } from "react";
import { editorTabsStore, type TabKind } from "./editor-tabs-store";

export interface RegisterTabArgs {
  kind: TabKind;
  id: string;
  href: string;
  title: string;
  icon?: string | null;
}

export function useRegisterTab(args: RegisterTabArgs | null) {
  const kind = args?.kind;
  const id = args?.id;
  const href = args?.href;
  const title = args?.title;
  const icon = args?.icon ?? null;

  useEffect(() => {
    if (!kind || !id || !href || typeof title !== "string") return;
    editorTabsStore.openTab({
      key: `${kind}:${id}`,
      kind,
      href,
      title,
      icon,
    });
  }, [kind, id, href, title, icon]);
}
