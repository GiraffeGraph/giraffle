"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { KanbanCardData, KanbanPriority, UpdateCardInput } from "@/domain/kanban/kanban.types";
import { Button } from "@/components/ui/Button";
import { PRIORITY_META, PRIORITY_ORDER } from "./kanban-meta";

function toDateInput(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeInput(date: Date | null): string {
  if (!date) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Combine the date + time inputs into a local Date (defaults to 09:00). */
function combineDueDate(dateValue: string, timeValue: string): Date | null {
  if (!dateValue) return null;
  const time = timeValue || "09:00";
  const date = new Date(`${dateValue}T${time}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function KanbanCardEditor({
  card,
  onSave,
  onDelete,
  onClose,
}: {
  card: KanbanCardData;
  onSave: (patch: UpdateCardInput) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [priority, setPriority] = useState<KanbanPriority | null>(card.priority);
  const [dueDate, setDueDate] = useState(toDateInput(card.dueDate));
  const [dueTime, setDueTime] = useState(toTimeInput(card.dueDate));
  const [duration, setDuration] = useState(
    card.durationMinutes != null ? String(card.durationMinutes) : "",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    const trimmedDuration = duration.trim();
    const parsedDuration = trimmedDuration === "" ? null : Math.max(0, parseInt(trimmedDuration, 10) || 0);
    onSave({
      title: title.trim() || "Untitled",
      description: description.trim() ? description.trim() : null,
      priority,
      dueDate: combineDueDate(dueDate, dueTime),
      durationMinutes: parsedDuration,
    });
    onClose();
  };

  return createPortal(
    <div className="kb-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="kb-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kb-modal-header">
          <h2 className="kb-modal-title">Edit card</h2>
          <button type="button" className="kb-modal-close" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="kb-modal-body">
          <label className="kb-field">
            <span className="kb-field-label">Title</span>
            <input
              className="kb-input"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              }}
              placeholder="Card title"
            />
          </label>

          <label className="kb-field">
            <span className="kb-field-label">Notes</span>
            <textarea
              className="kb-input kb-textarea"
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
            />
          </label>

          <div className="kb-field">
            <span className="kb-field-label">Priority</span>
            <div className="kb-prio-picker">
              <button
                type="button"
                className={`kb-prio-option${priority === null ? " kb-prio-option--active" : ""}`}
                onClick={() => setPriority(null)}
              >
                <span className="material-symbols-outlined">block</span>
                None
              </button>
              {PRIORITY_ORDER.map((key) => {
                const meta = PRIORITY_META[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={`kb-prio-option ${meta.className}${
                      priority === key ? " kb-prio-option--active" : ""
                    }`}
                    onClick={() => setPriority(key)}
                  >
                    <span className="material-symbols-outlined">{meta.icon}</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="kb-field-row kb-field-row--3">
            <label className="kb-field">
              <span className="kb-field-label">Due date</span>
              <input
                type="date"
                className="kb-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="kb-field">
              <span className="kb-field-label">Time</span>
              <input
                type="time"
                className="kb-input"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
              />
            </label>
            <label className="kb-field">
              <span className="kb-field-label">Duration (min)</span>
              <input
                type="number"
                min={0}
                className="kb-input"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="—"
              />
            </label>
          </div>
          {dueDate ? (
            <p className="kb-field-hint">
              <span className="material-symbols-outlined">calendar_month</span>
              Has a due date — this card also shows in Stride.
            </p>
          ) : null}
        </div>

        <div className="kb-modal-footer">
          <Button type="button" variant="text" onClick={onDelete} className="kb-danger-text">
            Delete
          </Button>
          <div className="kb-modal-footer-right">
            <Button type="button" variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
