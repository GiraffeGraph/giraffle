"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

export type CanvasTextNodeData = {
  text: string;
  focusToken?: string;
  onTextChange?: (text: string) => void;
};

export function CanvasTextNode({
  data,
  selected,
}: NodeProps<Node<CanvasTextNodeData>>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.text ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(data.text ?? "");
  }, [data.text]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      const length = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(length, length);
    }
  }, [editing]);

  useEffect(() => {
    if (!data.focusToken) return;
    setEditing(true);
  }, [data.focusToken]);

  const commit = () => {
    setEditing(false);
    data.onTextChange?.(value);
  };

  return (
    <div
      className={`svn-node-canvas-text${selected ? " svn-node-canvas-text--selected" : ""}`}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {editing ? (
        <textarea
          ref={inputRef}
          className="svn-node-canvas-text__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              setValue(data.text ?? "");
              setEditing(false);
            }
          }}
        />
      ) : (
        <pre className="svn-node-canvas-text__value">{value.trim() ? value : "Type…"}</pre>
      )}
    </div>
  );
}
