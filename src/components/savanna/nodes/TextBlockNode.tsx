"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

export type TextBlockNodeData = {
  text: string;
  onTextChange?: (text: string) => void;
};

export function TextBlockNode({
  data,
  selected,
}: NodeProps<Node<TextBlockNodeData>>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.text ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setValue(data.text ?? "");
  }, [data.text]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(value.length, value.length);
    }
  }, [editing, value.length]);

  const commit = () => {
    setEditing(false);
    data.onTextChange?.(value);
  };

  return (
    <div
      className={`svn-node-text${selected ? " svn-node-text--selected" : ""}`}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <textarea
          ref={inputRef}
          className="svn-node-text__input"
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
          spellCheck
        />
      ) : (
        <pre className="svn-node-text__content">{value.trim() ? value : "Double-click and start writing…"}</pre>
      )}
    </div>
  );
}
