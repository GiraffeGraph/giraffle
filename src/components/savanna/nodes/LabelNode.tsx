"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { useState, useRef, useEffect } from "react";

export type LabelNodeData = {
  text: string;
  onTextChange?: (text: string) => void;
};

export function LabelNode({
  data,
  selected,
}: NodeProps<Node<LabelNodeData>>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(data.text);
  }, [data.text]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    data.onTextChange?.(value.trim() || "Label");
  };

  return (
    <div
      className={`svn-node-label${selected ? " svn-node-label--selected" : ""}`}
      onDoubleClick={() => setEditing(true)}
    >
      {editing ? (
        <textarea
          ref={inputRef}
          className="svn-node-label__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setValue(data.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="svn-node-label__text">{value || "Label"}</span>
      )}
    </div>
  );
}
