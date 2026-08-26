import { addDays, dayKey, formatDue, parseDue, type Page } from "@giraffle/domain";

export interface ImportedCalendarItem {
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  calendarColor?: string | null;
  description?: string | null;
}

const escapeText = (value: string) => value
  .replace(/\\/g, "\\\\")
  .replace(/\r?\n/g, "\\n")
  .replace(/,/g, "\\,")
  .replace(/;/g, "\\;");
const unescapeText = (value: string) => value
  .replace(/\\n/gi, "\n")
  .replace(/\\([\\,;])/g, "$1");
const compactDay = (day: string) => day.replace(/-/g, "");
const expandDay = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
const pad = (value: number) => String(value).padStart(2, "0");

function localDateTime(day: string, minutes: number): string {
  return `${compactDay(day)}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

function fold(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73));
    rest = rest.slice(73);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

export function exportCalendarIcs(pages: readonly Page[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Giraffle//Private Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Giraffle",
  ];
  for (const page of pages) {
    const due = parseDue(page.scheduledAt);
    if (!due || page.isArchived) continue;
    lines.push("BEGIN:VEVENT", `UID:${escapeText(page.id)}@giraffle.local`, `DTSTAMP:${localDateTime(dayKey(new Date()), 0)}Z`);
    if (due.minutes === null) {
      lines.push(`DTSTART;VALUE=DATE:${compactDay(due.day)}`, `DTEND;VALUE=DATE:${compactDay(addDays(due.day, 1))}`);
    } else {
      const duration = Math.max(15, page.durationMinutes ?? 30);
      const endMinutes = due.minutes + duration;
      const endDay = addDays(due.day, Math.floor(endMinutes / (24 * 60)));
      lines.push(`DTSTART:${localDateTime(due.day, due.minutes)}`, `DTEND:${localDateTime(endDay, endMinutes % (24 * 60))}`);
    }
    lines.push(`SUMMARY:${escapeText(page.title || "Untitled")}`);
    if (page.description) lines.push(`DESCRIPTION:${escapeText(page.description)}`);
    if (page.calendarColor) lines.push(`COLOR:${page.calendarColor}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function parseDateValue(value: string): { day: string; minutes: number | null; absolute: Date | null } | null {
  if (/^\d{8}$/.test(value)) {
    const day = expandDay(value);
    return parseDue(day) ? { day, minutes: null, absolute: null } : null;
  }
  const match = /^(\d{8})T(\d{2})(\d{2})(?:\d{2})?(Z)?$/.exec(value);
  if (!match?.[1]) return null;
  if (match[4]) {
    const iso = `${expandDay(match[1])}T${match[2]}:${match[3]}:00Z`;
    const absolute = new Date(iso);
    if (Number.isNaN(absolute.getTime())) return null;
    return { day: dayKey(absolute), minutes: absolute.getHours() * 60 + absolute.getMinutes(), absolute };
  }
  const day = expandDay(match[1]);
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return parseDue(formatDue(day, minutes)) ? { day, minutes, absolute: null } : null;
}

export function importCalendarIcs(source: string): ImportedCalendarItem[] {
  const unfolded = source.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const items: ImportedCalendarItem[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const valueOf = (name: string) => {
      const line = lines.find((candidate) => candidate.toUpperCase().startsWith(`${name.toUpperCase()}:`) || candidate.toUpperCase().startsWith(`${name.toUpperCase()};`));
      return line?.slice(line.indexOf(":") + 1).trim() ?? null;
    };
    const start = parseDateValue(valueOf("DTSTART") ?? "");
    if (!start) continue;
    const end = parseDateValue(valueOf("DTEND") ?? "");
    let durationMinutes: number | null = null;
    if (start.minutes !== null) {
      if (start.absolute && end?.absolute) durationMinutes = Math.max(15, Math.round((end.absolute.getTime() - start.absolute.getTime()) / 60_000));
      else if (end?.minutes !== null && end?.minutes !== undefined) {
        const dayOffset = Math.round((new Date(`${end.day}T12:00:00`).getTime() - new Date(`${start.day}T12:00:00`).getTime()) / 86_400_000);
        durationMinutes = Math.max(15, dayOffset * 24 * 60 + end.minutes - start.minutes);
      } else durationMinutes = 30;
    }
    items.push({
      title: unescapeText(valueOf("SUMMARY") ?? "Imported event") || "Imported event",
      scheduledAt: formatDue(start.day, start.minutes),
      durationMinutes,
      calendarColor: /^#[0-9a-f]{6}$/i.test(valueOf("COLOR") ?? "") ? valueOf("COLOR") : null,
      description: valueOf("DESCRIPTION") ? unescapeText(valueOf("DESCRIPTION") as string) : null,
    });
  }
  return items;
}
