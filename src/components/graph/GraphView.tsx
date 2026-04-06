"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GraphProjection, UnresolvedLink } from "@/domain/link/link.types";

interface GraphViewProps {
  graph: GraphProjection;
  unresolvedLinks: UnresolvedLink[];
}

export function GraphView({ graph, unresolvedLinks }: GraphViewProps) {
  const router = useRouter();
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "orphan">("all");
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredNodes = useMemo(
    () =>
      graph.nodes.filter((node) => {
        if (filter === "published" && !node.isPublished) {
          return false;
        }

        if (filter === "orphan" && node.degree > 0) {
          return false;
        }

        if (normalizedQuery && !node.title.toLowerCase().includes(normalizedQuery)) {
          return false;
        }

        return true;
      }),
    [filter, graph.nodes, normalizedQuery]
  );

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((node) => node.id)),
    [filteredNodes]
  );

  const filteredEdges = useMemo(
    () =>
      graph.edges.filter(
        (edge) =>
          filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
      ),
    [filteredNodeIds, graph.edges]
  );

  const layout = useMemo(() => {
    const centerX = 460;
    const centerY = 280;
    const radius = 190;

    return new Map(
      filteredNodes.map((node, index) => {
        const angle =
          (index / Math.max(filteredNodes.length, 1)) * Math.PI * 2;
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
  }, [filteredNodes]);

  const activeEdges = filteredEdges.filter(
    (edge) => edge.source === activeNodeId || edge.target === activeNodeId
  );
  const activeNode =
    filteredNodes.find((node) => node.id === activeNodeId) ??
    filteredNodes[0] ??
    null;
  const orphanCount = graph.nodes.filter((node) => node.degree === 0).length;

  return (
    <div className="graph-page">
      <div className="graph-header">
        <h1 className="graph-title">Bağlantı ağı</h1>
        <p className="graph-subtitle">
          Kalıcı wikilink projeksiyonlarıyla notları, bağlantısız düğümleri ve
          çözülmemiş hedefleri gör.
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
          <div className="graph-stat-chip">
            <span className="graph-stat-number">{orphanCount}</span>
            <span className="graph-stat-label">bağlantısız</span>
          </div>
          <div className="graph-stat-chip">
            <span className="graph-stat-number">{unresolvedLinks.length}</span>
            <span className="graph-stat-label">çözülmemiş</span>
          </div>
        </div>
        <div className="graph-toolbar">
          <input
            type="search"
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Not ara..."
          />
          <select
            className="search-select"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as "all" | "published" | "orphan")
            }
          >
            <option value="all">Tüm notlar</option>
            <option value="published">Yayımdaki notlar</option>
            <option value="orphan">Sadece bağlantısız</option>
          </select>
        </div>
      </div>

      <div className="graph-layout">
        <div className="graph-canvas">
          <svg viewBox="0 0 920 560" className="graph-svg" role="img">
            {filteredEdges.map((edge) => {
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

            {filteredNodes.map((node) => {
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
                    Bu not için çözümlenmiş bağlantı yok.
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

          <div className="graph-panel-section-title">Çözülmemiş bağlantılar</div>
          <div className="graph-panel-list">
            {unresolvedLinks.length === 0 ? (
              <div className="graph-panel-empty">Çözülmemiş hedef yok.</div>
            ) : (
              unresolvedLinks.slice(0, 8).map((item) => (
                <div key={item.targetRaw} className="graph-panel-link">
                  {item.targetRaw} · {item.count}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
