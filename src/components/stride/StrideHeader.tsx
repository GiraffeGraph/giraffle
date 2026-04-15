"use client";

import { useRef, useState } from "react";
import type { CalendarView } from "./stride.types";

const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  custom: "Custom",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatWindowLabel(
  view: CalendarView,
  anchor: Date,
  window: { start: Date; end: Date }
): string {
  if (view === "month") {
    return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }
  if (view === "day") {
    return anchor.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  const s = window.start;
  const e = new Date(window.end.getTime() - 1);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  if (sameYear) {
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`;
}

interface StrideHeaderProps {
  view: CalendarView;
  anchor: Date;
  customDays: number;
  isPending: boolean;
  showUnscheduled: boolean;
  window: { start: Date; end: Date };
  onViewChange: (v: CalendarView) => void;
  onNavigate: (dir: -1 | 1) => void;
  onGoToday: () => void;
  onCustomDaysChange: (n: number) => void;
  onToggleUnscheduled: () => void;
}

export function StrideHeader({
  view,
  anchor,
  customDays,
  isPending,
  showUnscheduled,
  window,
  onViewChange,
  onNavigate,
  onGoToday,
  onCustomDaysChange,
  onToggleUnscheduled,
}: StrideHeaderProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const customPickerRef = useRef<HTMLDivElement>(null);

  const label = formatWindowLabel(view, anchor, window);

  return (
    <div className="stride-header">
      {/* Left: nav arrows + today */}
      <div className="stride-header-left">
        <button
          className="stride-nav-btn"
          onClick={() => onNavigate(-1)}
          aria-label="Previous"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            chevron_left
          </span>
        </button>
        <button
          className="stride-nav-btn"
          onClick={() => onNavigate(1)}
          aria-label="Next"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            chevron_right
          </span>
        </button>
        <button className="stride-today-btn" onClick={onGoToday}>
          Today
        </button>
        <span className="stride-window-label">
          {isPending ? (
            <span className="stride-spinner" aria-hidden="true" />
          ) : null}
          {label}
        </span>
      </div>

      {/* Right: view selector + unscheduled toggle */}
      <div className="stride-header-right">
        <div className="stride-view-tabs" role="tablist">
          {(["day", "week", "month", "custom"] as CalendarView[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={`stride-view-tab${view === v ? " active" : ""}`}
              onClick={() => {
                if (v === "custom") setShowCustomPicker((s) => !s);
                else setShowCustomPicker(false);
                onViewChange(v);
              }}
            >
              {VIEW_LABELS[v]}
              {v === "custom" && view === "custom" ? ` (${customDays}d)` : ""}
            </button>
          ))}
        </div>

        {showCustomPicker && view === "custom" && (
          <div className="stride-custom-picker" ref={customPickerRef}>
            <span className="stride-custom-picker-label">Days:</span>
            {[2, 3, 4, 5, 7, 10, 14].map((n) => (
              <button
                key={n}
                className={`stride-custom-day-btn${customDays === n ? " active" : ""}`}
                onClick={() => {
                  onCustomDaysChange(n);
                  setShowCustomPicker(false);
                }}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <button
          className={`stride-panel-toggle${showUnscheduled ? " active" : ""}`}
          onClick={onToggleUnscheduled}
          title="Toggle unscheduled todos panel"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            checklist
          </span>
          <span>Backlog</span>
        </button>
      </div>
    </div>
  );
}
