"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCoatCanvasAction } from "@/server/api/coat-canvas";
import { COAT_TEMPLATES } from "@/domain/coat-canvas/coat-canvas.types";
import type { CoatCanvasSummary, TemplateKey } from "@/domain/coat-canvas/coat-canvas.types";

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("tr", { numeric: "auto" });

function relativeTime(date: Date): string {
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "az önce";
  if (abs < 3600) return RELATIVE_FORMATTER.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return RELATIVE_FORMATTER.format(Math.round(diff / 3600), "hour");
  return RELATIVE_FORMATTER.format(Math.round(diff / 86400), "day");
}

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: (typeof COAT_TEMPLATES)[0];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const cellCount = template.cells.length;
  return (
    <button
      className={`cc-template-card${isSelected ? " cc-template-card--selected" : ""}`}
      type="button"
      onClick={onSelect}
    >
      <span className="material-symbols-outlined cc-template-icon">{template.icon}</span>
      <span className="cc-template-name">{template.name}</span>
      <span className="cc-template-desc">{template.description}</span>
      {cellCount > 0 && <span className="cc-template-count">{cellCount} kutu</span>}
    </button>
  );
}

function NewCanvasModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>("lean");
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const template = COAT_TEMPLATES.find((t) => t.key === selectedTemplate)!;

  const handleCreate = () => {
    if (isCreating) return;
    setIsCreating(true);
    startTransition(async () => {
      const canvasId = await createCoatCanvasAction({
        title: title.trim() || template.name,
        cells: template.cells,
      });
      router.push(`/coat-canvas/${canvasId}`);
    });
  };

  return (
    <div className="cc-modal-backdrop" onClick={onClose}>
      <div className="cc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cc-modal-header">
          <h2 className="cc-modal-title">Yeni Canvas</h2>
          <button className="cc-modal-close" type="button" onClick={onClose}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Title input */}
        <div className="cc-modal-section">
          <label className="cc-modal-label">Canvas adı</label>
          <input
            className="cc-modal-input"
            placeholder={template.name}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
        </div>

        {/* Template picker */}
        <div className="cc-modal-section">
          <label className="cc-modal-label">Şablon seç</label>
          <div className="cc-template-grid">
            {COAT_TEMPLATES.map((t) => (
              <TemplateCard
                key={t.key}
                template={t}
                isSelected={selectedTemplate === t.key}
                onSelect={() => setSelectedTemplate(t.key)}
              />
            ))}
          </div>
        </div>

        <div className="cc-modal-footer">
          <button className="cc-btn cc-btn--ghost" type="button" onClick={onClose}>
            İptal
          </button>
          <button
            className="cc-btn cc-btn--primary"
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
          >
            {isCreating ? (
              <span className="cc-spinner" />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            )}
            Oluştur
          </button>
        </div>
      </div>
    </div>
  );
}

export function CoatCanvasListPage({
  canvases,
}: {
  canvases: CoatCanvasSummary[];
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="cc-list-page">
      {/* Header */}
      <div className="cc-list-header">
        <div className="cc-list-header-text">
          <h1 className="cc-list-title">Coat Canvas</h1>
          <p className="cc-list-subtitle">
            Farklı boyutlarda kutularla esnek çalışma alanları
          </p>
        </div>
        <button
          className="cc-btn cc-btn--primary"
          type="button"
          onClick={() => setShowModal(true)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Yeni Canvas
        </button>
      </div>

      {/* Canvas grid */}
      {canvases.length === 0 ? (
        <div className="cc-empty">
          <span className="material-symbols-outlined cc-empty-icon">texture</span>
          <p className="cc-empty-title">Henüz canvas yok</p>
          <p className="cc-empty-sub">İlk canvas'ını oluşturmak için yukarıdaki butona tıkla</p>
          <button
            className="cc-btn cc-btn--primary"
            type="button"
            onClick={() => setShowModal(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Yeni Canvas
          </button>
        </div>
      ) : (
        <div className="cc-canvas-grid">
          {canvases.map((canvas) => (
            <button
              key={canvas.id}
              className="cc-canvas-card"
              type="button"
              onClick={() => router.push(`/coat-canvas/${canvas.id}`)}
            >
              {/* Mini preview: fake cells */}
              <div className="cc-canvas-preview">
                {[4, 8, 3, 5, 7, 6].slice(0, Math.min(canvas.cellCount, 6)).map((w, i) => (
                  <div
                    key={i}
                    className="cc-canvas-preview-cell"
                    style={{ gridColumn: `span ${Math.min(w, 6)}` }}
                  />
                ))}
              </div>
              <div className="cc-canvas-card-body">
                <span className="cc-canvas-card-title">{canvas.title}</span>
                <div className="cc-canvas-card-meta">
                  <span>{canvas.cellCount} kutu</span>
                  <span>·</span>
                  <span>{relativeTime(new Date(canvas.updatedAt))}</span>
                </div>
              </div>
            </button>
          ))}

          {/* Add new */}
          <button
            className="cc-canvas-card cc-canvas-card--new"
            type="button"
            onClick={() => setShowModal(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add</span>
            <span>Yeni Canvas</span>
          </button>
        </div>
      )}

      {showModal && <NewCanvasModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
