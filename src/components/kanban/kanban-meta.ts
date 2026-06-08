import type { KanbanColumnColor, KanbanPriority } from "@/domain/kanban/kanban.types";

/**
 * Shared visual vocabulary for Trek. Priorities deliberately reuse the Tower
 * Matrix Eisenhower icons + accents so a card's priority badge reads the same
 * across surfaces.
 */
export const PRIORITY_META: Record<
  KanbanPriority,
  { icon: string; className: string; label: string }
> = {
  DO: { icon: "bolt", className: "kb-prio--do", label: "Do now" },
  SCHEDULE: { icon: "event", className: "kb-prio--schedule", label: "Schedule" },
  DELEGATE: { icon: "group", className: "kb-prio--delegate", label: "Delegate" },
  ELIMINATE: { icon: "delete_sweep", className: "kb-prio--eliminate", label: "Eliminate" },
};

export const PRIORITY_ORDER: KanbanPriority[] = ["DO", "SCHEDULE", "DELEGATE", "ELIMINATE"];

export const COLUMN_COLOR_META: Record<KanbanColumnColor, { label: string; className: string }> = {
  neutral: { label: "Neutral", className: "kb-col--neutral" },
  blue: { label: "Blue", className: "kb-col--blue" },
  amber: { label: "Amber", className: "kb-col--amber" },
  green: { label: "Green", className: "kb-col--green" },
  red: { label: "Red", className: "kb-col--red" },
  purple: { label: "Purple", className: "kb-col--purple" },
};

export const COLUMN_COLOR_ORDER: KanbanColumnColor[] = [
  "neutral",
  "blue",
  "amber",
  "green",
  "red",
  "purple",
];

const dueDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
});

export function formatDueDate(date: Date): string {
  return dueDateFormatter.format(date);
}

/** Day-granularity bucket relative to today for due-date urgency styling. */
export function dueState(date: Date, now = new Date()): "overdue" | "today" | "soon" | "later" {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((a - b) / 86_400_000);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  return "later";
}
