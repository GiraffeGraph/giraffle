"use client";

import { type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type DrawPoint = { x: number; y: number };
export type DrawStroke = DrawPoint[];

export type DrawNodeData = {
  strokes?: DrawStroke[];
  onStrokesChange?: (strokes: DrawStroke[]) => void;
};

function pathFromStroke(stroke: DrawStroke): string {
  if (stroke.length === 0) return "";
  if (stroke.length === 1) return `M ${stroke[0]?.x ?? 0} ${stroke[0]?.y ?? 0}`;

  return stroke
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

export function DrawNode({
  data,
  selected,
}: NodeProps<Node<DrawNodeData>>) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const activeStrokeRef = useRef<DrawStroke>([]);
  const [strokes, setStrokes] = useState<DrawStroke[]>(data.strokes ?? []);

  useEffect(() => {
    setStrokes(data.strokes ?? []);
  }, [data.strokes]);

  const persist = (next: DrawStroke[]) => {
    setStrokes(next);
    data.onStrokesChange?.(next);
  };

  const getPoint = (event: ReactPointerEvent<HTMLDivElement>): DrawPoint | null => {
    const surface = surfaceRef.current;
    if (!surface) return null;

    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);

    return { x, y };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const point = getPoint(event);
    if (!point) return;

    drawingRef.current = true;
    activeStrokeRef.current = [point];
    event.currentTarget.setPointerCapture(event.pointerId);
    setStrokes((current) => [...current, [point]]);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const point = getPoint(event);
    if (!point) return;

    activeStrokeRef.current = [...activeStrokeRef.current, point];

    setStrokes((current) => {
      if (current.length === 0) return [[point]];
      const copy = [...current];
      copy[copy.length - 1] = activeStrokeRef.current;
      return copy;
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    persist([...strokes]);
  };

  const paths = useMemo(() => strokes.map((stroke) => pathFromStroke(stroke)), [strokes]);

  return (
    <div className={`svn-node-draw${selected ? " svn-node-draw--selected" : ""}`}>
      <div className="svn-node-draw__header">
        <span className="svn-node-draw__title">Draw</span>
        <button
          type="button"
          className="svn-node-draw__clear"
          onClick={(event) => {
            event.stopPropagation();
            persist([]);
          }}
        >
          Clear
        </button>
      </div>
      <div
        ref={surfaceRef}
        className="svn-node-draw__surface nodrag nopan"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <svg className="svn-node-draw__svg" viewBox="0 0 1000 700" preserveAspectRatio="none">
          {paths.map((path, index) => (
            <path
              key={`${path}-${index}`}
              d={path}
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
