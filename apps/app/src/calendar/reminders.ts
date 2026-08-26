import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseDue, type Page } from "@giraffle/domain";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const KEY = "giraffle.calendar.reminders";
const CHANNEL = "giraffle-calendar";

interface ReminderRecord {
  minutesBefore: number;
  notificationId: string;
  scheduledAt: string;
  title: string;
}

type ReminderMap = Record<string, ReminderRecord>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function read(): Promise<ReminderMap> {
  const stored = await AsyncStorage.getItem(KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored) as ReminderMap;
  } catch {
    return {};
  }
}

const write = (records: ReminderMap) => AsyncStorage.setItem(KEY, JSON.stringify(records));

function startDate(page: Page): Date | null {
  const due = parseDue(page.scheduledAt);
  if (!due) return null;
  const minutes = due.minutes ?? 9 * 60;
  return new Date(`${due.day}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`);
}

async function ensurePermission(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Calendar reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Notification permission was not granted");
}

async function schedule(page: Page, minutesBefore: number): Promise<string> {
  const start = startDate(page);
  if (!start) throw new Error("This item needs a date before it can remind you");
  const triggerDate = new Date(start.getTime() - minutesBefore * 60_000);
  if (triggerDate.getTime() <= Date.now()) throw new Error("That reminder time has already passed");
  return Notifications.scheduleNotificationAsync({
    content: {
      title: page.title || "Calendar item",
      body: minutesBefore === 0 ? "Starts now" : `Starts in ${minutesBefore} minutes`,
      data: { pageId: page.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(Platform.OS === "android" ? { channelId: CHANNEL } : {}),
    },
  });
}

export async function calendarReminders(): Promise<Record<string, number>> {
  const records = await read();
  return Object.fromEntries(Object.entries(records).map(([id, record]) => [id, record.minutesBefore]));
}

export async function setCalendarReminder(page: Page, minutesBefore: number | null): Promise<void> {
  const records = await read();
  const previous = records[page.id];
  if (previous) await Notifications.cancelScheduledNotificationAsync(previous.notificationId).catch(() => undefined);
  if (minutesBefore === null) {
    delete records[page.id];
    await write(records);
    return;
  }
  await ensurePermission();
  const notificationId = await schedule(page, minutesBefore);
  records[page.id] = { minutesBefore, notificationId, scheduledAt: page.scheduledAt ?? "", title: page.title };
  await write(records);
}

export function listenForCalendarReminderPress(openPage: (pageId: string) => void): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    const pageId = response?.notification.request.content.data?.pageId;
    if (typeof pageId === "string" && pageId) openPage(pageId);
  };
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}

export async function reconcileCalendarReminders(pages: readonly Page[]): Promise<void> {
  const records = await read();
  const byId = new Map(pages.map((page) => [page.id, page]));
  let changed = false;
  for (const [id, record] of Object.entries(records)) {
    const page = byId.get(id);
    if (!page || page.isArchived || !page.scheduledAt) {
      await Notifications.cancelScheduledNotificationAsync(record.notificationId).catch(() => undefined);
      delete records[id];
      changed = true;
      continue;
    }
    if (record.scheduledAt === page.scheduledAt && record.title === page.title) continue;
    await Notifications.cancelScheduledNotificationAsync(record.notificationId).catch(() => undefined);
    try {
      record.notificationId = await schedule(page, record.minutesBefore);
      record.scheduledAt = page.scheduledAt;
      record.title = page.title;
    } catch {
      delete records[id];
    }
    changed = true;
  }
  if (changed) await write(records);
}
