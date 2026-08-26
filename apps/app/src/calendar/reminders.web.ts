import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseDue, type Page } from "@giraffle/domain";

const KEY = "giraffle.calendar.reminders";
const timers = new Map<string, ReturnType<typeof setTimeout>>();

interface ReminderRecord {
  minutesBefore: number;
  scheduledAt: string;
  title: string;
}
type ReminderMap = Record<string, ReminderRecord>;

async function read(): Promise<ReminderMap> {
  const stored = await AsyncStorage.getItem(KEY);
  if (!stored) return {};
  try { return JSON.parse(stored) as ReminderMap; } catch { return {}; }
}
const write = (records: ReminderMap) => AsyncStorage.setItem(KEY, JSON.stringify(records));

function reminderTime(page: Page, minutesBefore: number): number | null {
  const due = parseDue(page.scheduledAt);
  if (!due) return null;
  const minutes = due.minutes ?? 9 * 60;
  const start = new Date(`${due.day}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`);
  return start.getTime() - minutesBefore * 60_000;
}

function arm(page: Page, minutesBefore: number) {
  const previous = timers.get(page.id);
  if (previous) clearTimeout(previous);
  const at = reminderTime(page, minutesBefore);
  if (!at || at <= Date.now()) return;
  // Browsers cap timers at a signed 32-bit value; reconciliation arms far events later.
  const delay = Math.min(at - Date.now(), 2_147_000_000);
  timers.set(page.id, setTimeout(() => {
    if (Math.abs(at - Date.now()) > 2_000) {
      arm(page, minutesBefore);
      return;
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(page.title || "Calendar item", {
        body: minutesBefore === 0 ? "Starts now" : `Starts in ${minutesBefore} minutes`,
        tag: `giraffle-calendar-${page.id}`,
      });
    }
    timers.delete(page.id);
  }, delay));
}

export async function calendarReminders(): Promise<Record<string, number>> {
  const records = await read();
  return Object.fromEntries(Object.entries(records).map(([id, record]) => [id, record.minutesBefore]));
}

export async function setCalendarReminder(page: Page, minutesBefore: number | null): Promise<void> {
  const records = await read();
  const timer = timers.get(page.id);
  if (timer) clearTimeout(timer);
  timers.delete(page.id);
  if (minutesBefore === null) {
    delete records[page.id];
    await write(records);
    return;
  }
  if (!("Notification" in window)) throw new Error("Notifications are unavailable in this browser");
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");
  const at = reminderTime(page, minutesBefore);
  if (!at || at <= Date.now()) throw new Error("That reminder time has already passed");
  records[page.id] = { minutesBefore, scheduledAt: page.scheduledAt ?? "", title: page.title };
  await write(records);
  arm(page, minutesBefore);
}

export function listenForCalendarReminderPress(_openPage: (pageId: string) => void): () => void {
  return () => undefined;
}

export async function reconcileCalendarReminders(pages: readonly Page[]): Promise<void> {
  const records = await read();
  const byId = new Map(pages.map((page) => [page.id, page]));
  let changed = false;
  for (const [id, record] of Object.entries(records)) {
    const page = byId.get(id);
    if (!page || page.isArchived || !page.scheduledAt || !reminderTime(page, record.minutesBefore)) {
      delete records[id];
      const timer = timers.get(id);
      if (timer) clearTimeout(timer);
      timers.delete(id);
      changed = true;
      continue;
    }
    if (record.scheduledAt !== page.scheduledAt || record.title !== page.title) {
      record.scheduledAt = page.scheduledAt;
      record.title = page.title;
      changed = true;
    }
    arm(page, record.minutesBefore);
  }
  if (changed) await write(records);
}
