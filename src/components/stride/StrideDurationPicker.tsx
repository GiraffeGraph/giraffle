"use client";

import { useEffect, useRef } from "react";

const PRESETS = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "45m", value: 45 },
  { label: "1h", value: 60 },
  { label: "1.5h", value: 90 },
  { label: "2h", value: 120 },
  { label: "3h", value: 180 },
  { label: "4h", value: 240 },
  { label: "6h", value: 360 },
  { label: "8h", value: 480 },
];

interface StrideDurationPickerProps {
  value: number;
  onChange: (minutes: number) => void;
  onClose: () => void;
}

export function StrideDurationPicker({
  value,
  onChange,
  onClose,
}: StrideDurationPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} className="stride-duration-picker">
      <div className="stride-duration-picker-label">Duration</div>
      <div className="stride-duration-picker-grid">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`stride-duration-preset${value === p.value ? " active" : ""}`}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
