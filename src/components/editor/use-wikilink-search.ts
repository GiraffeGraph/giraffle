"use client";

import { useEffect, useState } from "react";
import type { NoteReference } from "@/domain/note/note.types";
import type { WikilinkMenuItem } from "./editor-types";

export function useWikilinkSearch(
  target: string | null,
  searchFn: ((query: string) => Promise<NoteReference[]>) | undefined,
  createFn: ((target: string) => Promise<NoteReference>) | undefined,
  debounceMs = 120,
): WikilinkMenuItem[] {
  const [items, setItems] = useState<WikilinkMenuItem[]>([]);

  useEffect(() => {
    if (target == null || !searchFn) {
      setItems([]);
      return;
    }

    const currentTarget = target.trim();
    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      const matchingNotes = await searchFn(currentTarget);
      if (cancelled) return;

      const normalizedTarget = currentTarget.toLowerCase();
      const next: WikilinkMenuItem[] = matchingNotes.map((note) => ({
        title: note.title,
        description: "Link to an existing note",
        icon: "[[",
        menuKey: `note:${note.id}`,
        note,
      }));

      if (
        createFn &&
        currentTarget.length > 0 &&
        !matchingNotes.some(
          (note) => note.title.toLowerCase() === normalizedTarget,
        )
      ) {
        next.push({
          title: `"${currentTarget}"" note`,
          description: "Create the note and insert a resolved wikilink",
          icon: "+",
          menuKey: `create:${normalizedTarget}`,
          createTarget: currentTarget,
        });
      }

      setItems(next);
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [target, searchFn, createFn, debounceMs]);

  return items;
}
