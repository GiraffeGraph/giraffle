"use client";

import { type Node, type NodeProps } from "@xyflow/react";

export type InkPoint = { x: number; y: number };

export type InkStrokeNodeData = {
  points: InkPoint[];
};

function pointsToPath(points: InkPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const point = points[0];
    return `M ${point?.x ?? 0} ${point?.y ?? 0}`;
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

export function InkStrokeNode({
  data,
  selected,
}: NodeProps<Node<InkStrokeNodeData>>) {
  const points = data.points ?? [];
  const path = pointsToPath(points);
  const maxX = Math.max(...points.map((point) => point.x), 1);
  const maxY = Math.max(...points.map((point) => point.y), 1);

  return (
    <div className={`svn-node-ink${selected ? " svn-node-ink--selected" : ""}`}>
      <svg
        className="svn-node-ink__svg"
        viewBox={`0 0 ${maxX} ${maxY}`}
        preserveAspectRatio="none"
      >
        <path
          d={path}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
