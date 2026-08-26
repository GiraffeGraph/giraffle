export const CALENDAR_COLORS = [
  { id: "1", name: "Lavender", hex: "#7986cb", foreground: "#ffffff" },
  { id: "2", name: "Sage", hex: "#33b679", foreground: "#ffffff" },
  { id: "3", name: "Grape", hex: "#8e24aa", foreground: "#ffffff" },
  { id: "4", name: "Flamingo", hex: "#e67c73", foreground: "#1f1f1f" },
  { id: "5", name: "Banana", hex: "#f6c026", foreground: "#1f1f1f" },
  { id: "6", name: "Tangerine", hex: "#f5511d", foreground: "#ffffff" },
  { id: "7", name: "Peacock", hex: "#039be5", foreground: "#ffffff" },
  { id: "8", name: "Graphite", hex: "#616161", foreground: "#ffffff" },
  { id: "9", name: "Blueberry", hex: "#3f51b5", foreground: "#ffffff" },
  { id: "10", name: "Basil", hex: "#0b8043", foreground: "#ffffff" },
  { id: "11", name: "Tomato", hex: "#d60000", foreground: "#ffffff" },
] as const;

export function calendarColorFromGoogle(colorId: string | undefined): string | null {
  return CALENDAR_COLORS.find((color) => color.id === colorId)?.hex ?? null;
}

export function googleColorFromCalendar(hex: string | null): string | null {
  return CALENDAR_COLORS.find((color) => color.hex.toLowerCase() === hex?.toLowerCase())?.id ?? null;
}

export function calendarColorStyle(hex: string | null | undefined) {
  const color = CALENDAR_COLORS.find((item) => item.hex.toLowerCase() === hex?.toLowerCase());
  return color ? { background: color.hex, foreground: color.foreground } : null;
}
