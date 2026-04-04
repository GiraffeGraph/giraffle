"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GraphProjection } from "@/domain/link/link.types";

interface GraphViewProps {
  graph: GraphProjection;
}

export function GraphView({ graph }: GraphViewProps) {
  const router = useRouter();
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const layout = useMemo(() => {
    const centerX = 460;
    const centerY = 280;
    const radius = 190;

    return new Map(
      graph.nodes.map((node, index) => {
        const angle = (index / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        return [
          node.id,
          {
            x,
            y,
          },
        ];
      })
    );
  }, [graph.nodes]);

  const activeEdges = graph.edges.filter(
    (edge) => edge.source === activeNodeId || edge.target === activeNodeId
  );
  const activeNode =
    graph.nodes.find((node) => node.id === activeNodeId) ?? graph.nodes[0] ?? null;

  return (
    <div className="graph-page">
      <div className="graph-header">
        <h1 className="graph-title">Bağlantı Ağı</h1>
        <p className="graph-subtitle">
          Kaydedilmiş wikilink ilişkileri düğüm ve kenar olarak gösterilir.
        </p>
        <div className="graph-stat-row">
          <div className="graph-stat-chip">
            <span className="graph-stat-number">{graph.nodes.length}</span>
            <span className="graph-stat-label">not</span>
          </div>
          <div className="graph-stat-chip">
            <span className="graph-stat-number">{graph.edges.length}</span>
            <span className="graph-stat-label">bağ</span>
          </div>
        </div>
      </div>

      <div className="graph-layout">
        <div className="graph-canvas">
          <svg viewBox="0 0 920 560" className="graph-svg" role="img">
            {graph.edges.map((edge) => {
              const sourcePosition = layout.get(edge.source);
              const targetPosition = layout.get(edge.target);

              if (!sourcePosition || !targetPosition) {
                return null;
              }

              const isActive =
                activeNodeId === null ||
                edge.source === activeNodeId ||
                edge.target === activeNodeId;

              return (
                <line
                  key={`${edge.source}-${edge.target}-${edge.label}`}
                  x1={sourcePosition.x}
                  y1={sourcePosition.y}
                  x2={targetPosition.x}
                  y2={targetPosition.y}
                  className={`graph-edge ${isActive ? "active" : "muted"}`}
                />
              );
            })}

            {graph.nodes.map((node) => {
              const position = layout.get(node.id);

              if (!position) {
                return null;
              }

              const radius = 18 + Math.min(node.degree, 6) * 2;
              const isActive =
                activeNodeId === null ||
                activeNodeId === node.id ||
                activeEdges.some(
                  (edge) => edge.source === node.id || edge.target === node.id
                );

              return (
                <g
                  key={node.id}
                  className={`graph-node ${isActive ? "active" : "muted"}`}
                  transform={`translate(${position.x} ${position.y})`}
                  onMouseEnter={() => setActiveNodeId(node.id)}
                  onMouseLeave={() => setActiveNodeId(null)}
                  onClick={() => router.push(`/notes/${node.id}`)}
                >
                  <circle r={radius} />
                  <text y={radius + 18} textAnchor="middle">
                    {node.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="graph-panel">
          {activeNode ? (
            <>
              <div className="graph-panel-title">{activeNode.title}</div>
              <div className="graph-panel-meta">
                Bağ sayısı {activeNode.degree} ·{" "}
                {activeNode.isPublished ? "Yayında" : "Özel"}
              </div>
              <div className="graph-panel-section-title">Bağlantılar</div>
              <div className="graph-panel-list">
                {activeEdges.length === 0 ? (
                  <div className="graph-panel-empty">
                    Henüz çözümlenmiş bağlantı yok.
                  </div>
                ) : (
                  activeEdges.map((edge) => (
                    <button
                      key={`${edge.source}-${edge.target}-${edge.label}`}
                      type="button"
                      className="graph-panel-link"
                      onClick={() =>
                        router.push(
                          `/notes/${
                            edge.source === activeNode.id ? edge.target : edge.source
                          }`
                        )
                      }
                    >
                      {edge.label}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="graph-panel-empty">
              İlk kayıttan sonra notlar ve bağlantılar burada görünür.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
