import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDays, dayKey, formatDue, parseDue, type Page } from "@giraffle/domain";
import type { VaultRepository } from "@/infrastructure/database/repository";
import { googleCalendarRequest } from "./googleCalendarBridge";
import { calendarColorFromGoogle, googleColorFromCalendar } from "./calendarColors";

const STATE_KEY = "giraffle.google-calendar.sync.v5";
const LEGACY_STATE_KEYS = ["giraffle.google-calendar.sync.v4", "giraffle.google-calendar.sync.v3", "giraffle.google-calendar.sync.v2", "giraffle.google-calendar.sync.v1"] as const;
const PAGE_ID_PROPERTY = "girafflePageId";
const MAX_DURATION_MINUTES = 24 * 60;

interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
}

interface GoogleEvent {
  id?: string;
  etag?: string;
  colorId?: string;
  recurringEventId?: string;
  status?: string;
  eventType?: string;
  summary?: string;
  description?: string;
  updated?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  extendedProperties?: { private?: Record<string, string> };
}

interface GoogleEventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

interface CalendarLink {
  eventId: string;
  etag: string | null;
  googleUpdatedAt: number;
  pageUpdatedAt: number;
  pageFingerprint: string;
  colorId: string | null;
  sourceId: string | null;
  imported: boolean;
}

interface CalendarSyncState {
  nextSyncToken: string | null;
  links: Record<string, CalendarLink>;
}

export interface GoogleCalendarSyncResult {
  imported: number;
  updated: number;
  exported: number;
  removed: number;
}

type RunRepository = <T>(action: (repository: VaultRepository) => Promise<T>) => Promise<T>;

class GoogleCalendarApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const emptyState = (): CalendarSyncState => ({ nextSyncToken: null, links: {} });

function parseState(raw: string | null): CalendarSyncState {
  if (!raw) return emptyState();
  try {
    const value = JSON.parse(raw) as Partial<CalendarSyncState>;
    if (!value.links || typeof value.links !== "object") return emptyState();
    return {
      nextSyncToken: typeof value.nextSyncToken === "string" ? value.nextSyncToken : null,
      links: Object.fromEntries(Object.entries(value.links).flatMap(([pageId, entry]) => {
        const link = entry as Partial<CalendarLink> | null;
        if (!link || typeof link.eventId !== "string" || typeof link.googleUpdatedAt !== "number" || typeof link.pageUpdatedAt !== "number") return [];
        return [[pageId, {
          eventId: link.eventId,
          etag: typeof link.etag === "string" ? link.etag : null,
          googleUpdatedAt: link.googleUpdatedAt,
          pageUpdatedAt: link.pageUpdatedAt,
          pageFingerprint: typeof link.pageFingerprint === "string" ? link.pageFingerprint : "",
          colorId: typeof link.colorId === "string" ? link.colorId : null,
          sourceId: typeof link.sourceId === "string" ? link.sourceId : null,
          imported: typeof link.imported === "boolean" ? link.imported : true,
        } satisfies CalendarLink]];
      })),
    };
  } catch {
    return emptyState();
  }
}

async function request<T>(input: Parameters<typeof googleCalendarRequest>[0]): Promise<T | null> {
  const response = await googleCalendarRequest<T>(input);
  if (response.ok) return response.data;
  const payload = response.data as { error?: { message?: string } } | null;
  throw new GoogleCalendarApiError(response.status, payload?.error?.message ?? `Google Calendar returned ${response.status}`);
}

function pageFingerprint(page: Page): string {
  return [page.title, page.scheduledAt, page.durationMinutes, page.calendarColor, page.description, page.isArchived].join("\u001f");
}

function eventSchedule(event: GoogleEvent): { scheduledAt: string; durationMinutes: number | null } | null {
  if (event.start?.date) return { scheduledAt: event.start.date, durationMinutes: null };
  if (!event.start?.dateTime) return null;
  const start = new Date(event.start.dateTime);
  if (Number.isNaN(start.getTime())) return null;
  const scheduledAt = formatDue(dayKey(start), start.getHours() * 60 + start.getMinutes());
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
  const rawDuration = end && !Number.isNaN(end.getTime()) ? Math.round((end.getTime() - start.getTime()) / 60_000) : 30;
  return {
    scheduledAt,
    durationMinutes: Math.max(15, Math.min(MAX_DURATION_MINUTES, rawDuration)),
  };
}

function localInstant(day: string, minutes: number): string {
  const date = new Date(`${day}T00:00:00`);
  date.setMinutes(minutes);
  return date.toISOString();
}

function eventBody(page: Page, colorId?: string | null) {
  const due = parseDue(page.scheduledAt);
  const googleColorId = googleColorFromCalendar(page.calendarColor) ?? colorId;
  if (!due) throw new Error("Only scheduled pages can be sent to Google Calendar");
  const privateProperties = { [PAGE_ID_PROPERTY]: page.id };
  if (due.minutes === null) {
    return {
      summary: page.title || "Untitled",
      ...(page.description ? { description: page.description } : {}),
      start: { date: due.day },
      end: { date: addDays(due.day, 1) },
      extendedProperties: { private: privateProperties },
      ...(googleColorId ? { colorId: googleColorId } : {}),
    };
  }
  return {
    summary: page.title || "Untitled",
    ...(page.description ? { description: page.description } : {}),
    start: { dateTime: localInstant(due.day, due.minutes) },
    end: { dateTime: localInstant(due.day, due.minutes + (page.durationMinutes ?? 30)) },
    extendedProperties: { private: privateProperties },
    ...(googleColorId ? { colorId: googleColorId } : {}),
  };
}

function eventPath(eventId?: string): string {
  return `/calendar/v3/calendars/primary/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
}

function queryPath(parameters: Record<string, string>): string {
  return `${eventPath()}?${new URLSearchParams(parameters).toString()}`;
}

function collapseRecurringEvents(events: GoogleEvent[]): GoogleEvent[] {
  const singles: GoogleEvent[] = [];
  const series = new Map<string, GoogleEvent[]>();
  for (const event of events) {
    if (!event.recurringEventId) {
      singles.push(event);
      continue;
    }
    const instances = series.get(event.recurringEventId) ?? [];
    instances.push(event);
    series.set(event.recurringEventId, instances);
  }
  const today = dayKey(new Date());
  for (const instances of series.values()) {
    const active = instances.filter((event) => event.status !== "cancelled" && eventSchedule(event));
    const ordered = active.sort((left, right) => (eventSchedule(left)?.scheduledAt ?? "").localeCompare(eventSchedule(right)?.scheduledAt ?? ""));
    const selected = ordered.find((event) => (eventSchedule(event)?.scheduledAt ?? "").slice(0, 10) >= today) ?? ordered.at(-1) ?? instances[0];
    if (selected) singles.push(selected);
  }
  return singles;
}

async function listChanges(syncToken: string | null): Promise<{ events: GoogleEvent[]; nextSyncToken: string }> {
  const events: GoogleEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;
  do {
    const parameters: Record<string, string> = {
      maxResults: "2500",
      showDeleted: "true",
      singleEvents: "true",
    };
    if (syncToken) parameters.syncToken = syncToken;
    else {
      const start = new Date();
      const end = new Date();
      start.setFullYear(start.getFullYear() - 1);
      end.setFullYear(end.getFullYear() + 2);
      parameters.timeMin = start.toISOString();
      parameters.timeMax = end.toISOString();
    }
    if (pageToken) parameters.pageToken = pageToken;
    const page = await request<GoogleEventsPage>({ method: "GET", path: queryPath(parameters) });
    if (!page) throw new Error("Google Calendar returned an empty event list");
    events.push(...(page.items ?? []).filter((event) => !event.eventType || event.eventType === "default"));
    pageToken = page.nextPageToken ?? null;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);
  if (!nextSyncToken) throw new Error("Google Calendar did not return a sync token");
  return { events: syncToken ? events : collapseRecurringEvents(events), nextSyncToken };
}

async function loadChanges(syncToken: string | null) {
  try {
    return await listChanges(syncToken);
  } catch (cause) {
    if (syncToken && cause instanceof GoogleCalendarApiError && cause.status === 410) return listChanges(null);
    throw cause;
  }
}

async function deleteEvent(link: CalendarLink): Promise<void> {
  try {
    await request<null>({ method: "DELETE", path: eventPath(link.eventId), ...(link.etag ? { etag: link.etag } : {}) });
  } catch (cause) {
    if (cause instanceof GoogleCalendarApiError && [404, 410].includes(cause.status)) return;
    throw cause;
  }
}

let activeSync: Promise<GoogleCalendarSyncResult> | null = null;

export function syncGoogleCalendar(pages: readonly Page[], run: RunRepository): Promise<GoogleCalendarSyncResult> {
  if (activeSync) return activeSync;
  activeSync = performSync(pages, run).finally(() => { activeSync = null; });
  return activeSync;
}

async function performSync(pages: readonly Page[], run: RunRepository): Promise<GoogleCalendarSyncResult> {
  const currentState = await AsyncStorage.getItem(STATE_KEY);
  let storedState = currentState;
  for (const key of LEGACY_STATE_KEYS) {
    if (storedState) break;
    storedState = await AsyncStorage.getItem(key);
  }
  const state = parseState(storedState);
  if (!currentState) state.nextSyncToken = null;
  const fullSync = state.nextSyncToken === null;
  const result: GoogleCalendarSyncResult = { imported: 0, updated: 0, exported: 0, removed: 0 };
  let completedToken: string | null = null;

  try {
    const changes = await loadChanges(state.nextSyncToken);
    const initialPages = new Map(pages.map((page) => [page.id, page]));
    const byEventId = () => new Map(Object.entries(state.links).map(([pageId, link]) => [link.eventId, pageId]));
    const bySourceId = () => new Map(Object.entries(state.links).map(([pageId, link]) => [link.sourceId ?? link.eventId, pageId]));
    const pulledPageIds = new Set<string>();
    const seenSourceIds = new Set(changes.events.flatMap((event) => event.id ? [event.recurringEventId ?? event.id] : []));

    const latest = await run(async (repository) => {
      for (const event of changes.events) {
        if (!event.id) continue;
        const taggedPageId = event.extendedProperties?.private?.[PAGE_ID_PROPERTY];
        const sourceId = event.recurringEventId ?? event.id;
        const pageId = (taggedPageId && initialPages.has(taggedPageId) ? taggedPageId : null) ?? bySourceId().get(sourceId) ?? byEventId().get(event.id) ?? null;
        const existing = pageId ? initialPages.get(pageId) : undefined;
        const link = pageId ? state.links[pageId] : undefined;
        const imported = link?.imported ?? !taggedPageId;

        if (event.status === "cancelled") {
          if (event.recurringEventId && link?.eventId !== event.id) continue;
          if (existing?.scheduledAt) {
            await repository.updatePage(existing.id, { scheduledAt: null, durationMinutes: null });
            pulledPageIds.add(existing.id);
            result.removed += 1;
          }
          if (pageId) delete state.links[pageId];
          continue;
        }

        const schedule = eventSchedule(event);
        if (!schedule) continue;
        const googleUpdatedAt = Date.parse(event.updated ?? "") || 0;

        if (!existing) {
          const createdId = await repository.createGoogleCalendarPage({
            title: event.summary?.trim() || "Untitled",
            scheduledAt: schedule.scheduledAt,
            durationMinutes: schedule.durationMinutes,
            calendarColor: calendarColorFromGoogle(event.colorId),
            description: event.description?.trim() || null,
          });
          initialPages.set(createdId, { id: createdId } as Page);
          state.links[createdId] = {
            eventId: event.id,
            etag: event.etag ?? null,
            googleUpdatedAt,
            pageUpdatedAt: 0,
            pageFingerprint: "",
            colorId: event.colorId ?? null,
            sourceId,
            imported: true,
          };
          pulledPageIds.add(createdId);
          result.imported += 1;
          continue;
        }

        if (imported) await repository.organizeGoogleCalendarPage(existing.id);
        const pageChanged = link ? pageFingerprint(existing) !== link.pageFingerprint : false;
        const googleChanged = !link || googleUpdatedAt > link.googleUpdatedAt;
        if (googleChanged && (!pageChanged || googleUpdatedAt >= existing.updatedAt)) {
          const nextTitle = event.summary?.trim() || "Untitled";
          const calendarColor = calendarColorFromGoogle(event.colorId);
          const description = event.description?.trim() || null;
          if (existing.title !== nextTitle || existing.scheduledAt !== schedule.scheduledAt || existing.durationMinutes !== schedule.durationMinutes || existing.calendarColor !== calendarColor || existing.description !== description) {
            await repository.updatePage(existing.id, { title: nextTitle, calendarColor, description, ...schedule });
            pulledPageIds.add(existing.id);
            result.updated += 1;
          }
        }
        state.links[existing.id] = {
          eventId: event.id,
          etag: event.etag ?? link?.etag ?? null,
          googleUpdatedAt,
          pageUpdatedAt: link?.pageUpdatedAt ?? 0,
          pageFingerprint: link?.pageFingerprint ?? "",
          colorId: event.colorId ?? link?.colorId ?? null,
          sourceId,
          imported,
        };
      }
      if (fullSync) {
        for (const [linkedPageId, linkedEvent] of Object.entries({ ...state.links })) {
          if (seenSourceIds.has(linkedEvent.sourceId ?? linkedEvent.eventId)) continue;
          const stalePage = initialPages.get(linkedPageId);
          if (stalePage) {
            if (pageFingerprint(stalePage) === linkedEvent.pageFingerprint || stalePage.updatedAt <= linkedEvent.pageUpdatedAt) await repository.archivePage(stalePage.id);
            else if (stalePage.scheduledAt) await repository.updatePage(stalePage.id, { scheduledAt: null, durationMinutes: null });
            result.removed += 1;
          }
          delete state.links[linkedPageId];
        }
      }
      return repository.snapshot();
    });

    const latestById = new Map(latest.pages.map((page) => [page.id, page]));
    for (const pageId of pulledPageIds) {
      const page = latestById.get(pageId);
      const link = state.links[pageId];
      if (page && link) {
        link.pageUpdatedAt = page.updatedAt;
        link.pageFingerprint = pageFingerprint(page);
      }
    }

    for (const [pageId, link] of Object.entries({ ...state.links })) {
      const page = latestById.get(pageId);
      if (page && !page.isArchived && parseDue(page.scheduledAt)) continue;
      await deleteEvent(link);
      delete state.links[pageId];
      result.removed += 1;
    }

    for (const page of latest.pages) {
      if (page.isArchived || !parseDue(page.scheduledAt)) continue;
      const link = state.links[page.id];
      if (link && pageFingerprint(page) === link.pageFingerprint) continue;
      const event = link
        ? await request<GoogleEvent>({ method: "PATCH", path: eventPath(link.eventId), ...(link.etag ? { etag: link.etag } : {}), body: eventBody(page, link.colorId) })
        : await request<GoogleEvent>({ method: "POST", path: eventPath(), body: eventBody(page) });
      if (!event?.id) throw new Error("Google Calendar did not return the saved event");
      state.links[page.id] = {
        eventId: event.id,
        etag: event.etag ?? null,
        googleUpdatedAt: Date.parse(event.updated ?? "") || Date.now(),
        pageUpdatedAt: page.updatedAt,
        pageFingerprint: pageFingerprint(page),
        colorId: event.colorId ?? link?.colorId ?? null,
        sourceId: link?.sourceId ?? event.id,
        imported: link?.imported ?? false,
      };
      result.exported += 1;
    }

    completedToken = changes.nextSyncToken;
    return result;
  } finally {
    if (completedToken) state.nextSyncToken = completedToken;
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
    await Promise.all(LEGACY_STATE_KEYS.map((key) => AsyncStorage.removeItem(key)));
  }
}

export async function resetGoogleCalendarSync(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(STATE_KEY), ...LEGACY_STATE_KEYS.map((key) => AsyncStorage.removeItem(key))]);
}

export const googleCalendarEventForPage = eventBody;
export const scheduleFromGoogleCalendarEvent = eventSchedule;
