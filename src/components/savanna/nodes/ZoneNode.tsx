"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { useState, useRef, useEffect } from "react";

export type ZoneNodeData = {
  label: string;
  color?: string | null;
  onLabelChange?: (label: string) => void;
};

export function ZoneNode({
  data,
  selected,
}: NodeProps<Node<ZoneNodeData>>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(data.label);
  }, [data.label]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    data.onLabelChange?.(value.trim() || "Zone");
  };

  return (
    <div
      className={`svn-node-zone${selected ? " svn-node-zone--selected" : ""}`}
      style={data.color ? { "--zone-color": data.color } as React.CSSProperties : undefined}
    >
      <div
        className="svn-node-zone__header"
        onDoubleClick={() => setEditing(true)}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="svn-node-zone__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setValue(data.label);
                setEditing(false);
              }
            }}
          />
        ) : (
          <span className="svn-node-zone__label">{value || "Zone"}</span>
        )}
      </div>
    </div>
  );
}
