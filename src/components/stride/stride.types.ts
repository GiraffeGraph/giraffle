export type CalendarView = "day" | "week" | "month" | "custom";

export interface CalendarTodo {
  id: string;
  text: string;
  checked: boolean;
  quadrant: "DO" | "SCHEDULE" | "DELEGATE" | "ELIMINATE" | null;
  dueDate: Date | null;
  durationMinutes: number; // default 60
  position: number;
  note: {
    id: string;
    title: string;
    icon: string | null;
  };
}

export type DragData =
  | { type: "stride:todo"; todoId: string }
  | { type: "stride:unscheduled"; todoId: string };

export function isDragData(value: unknown): value is DragData {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (
      (value as DragData).type === "stride:todo" ||
      (value as DragData).type === "stride:unscheduled"
    )
  );
}

export type DropSlot = {
  date: Date;      // midnight of the day
  hour: number;    // 0-23, -1 means "all-day"
};
