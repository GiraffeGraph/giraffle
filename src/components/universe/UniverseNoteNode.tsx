"use client";

import { useRouter } from "next/navigation";
import type { NodeProps } from "@xyflow/react";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import type { UniverseNoteNode as UniverseNoteNodeType } from "./universe.types";

function stopCanvasPointerPropagation(
  event:
    | React.PointerEvent<HTMLButtonElement>
    | React.MouseEvent<HTMLButtonElement>
    | React.TouchEvent<HTMLButtonElement>
) {
  event.stopPropagation();
}

export function UniverseNoteNode({
  data,
}: NodeProps<UniverseNoteNodeType>) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="universe-note-node nodrag nopan"
      onPointerDownCapture={stopCanvasPointerPropagation}
      onMouseDownCapture={stopCanvasPointerPropagation}
      onTouchStartCapture={stopCanvasPointerPropagation}
      onClick={() => router.push(`/notes/${data.noteId}`)}
    >
      <div className="universe-note-node__header">
        <span className="universe-note-node__icon" aria-hidden="true">
          {renderStoredIcon(data.icon, {
            fallback: (
              <span className="material-symbols-outlined sm" aria-hidden="true">
                description
              </span>
            ),
          })}
        </span>
        <span className="universe-note-node__title">{data.title}</span>
      </div>
      <p className="universe-note-node__snippet">{data.snippet}</p>
    </button>
  );
}
