"use client";

import { useRouter } from "next/navigation";
import type { NodeProps } from "@xyflow/react";
import type { UniversePortalNode } from "./universe.types";

export function PortalNode({ data }: NodeProps<UniversePortalNode>) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="universe-route-node universe-route-node--interactive nodrag"
      onClick={() => router.push(data.route)}
    >
      <div className="universe-route-node__eyebrow">{data.eyebrow}</div>
      <div className="universe-route-node__icon" aria-hidden="true">
        <span className="material-symbols-outlined">{data.icon}</span>
      </div>
      <h3 className="universe-route-node__title">{data.title}</h3>
      <p className="universe-route-node__description">{data.description}</p>
      {data.chips?.length ? (
        <div className="universe-route-node__chips">
          {data.chips.map((chip) => (
            <span key={chip} className="universe-route-node__chip">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}
