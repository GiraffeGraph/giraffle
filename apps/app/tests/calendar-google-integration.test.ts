import { EMPTY_DOCUMENT, type Page } from "@giraffle/domain";
import { googleCalendarRequest } from "@/calendar/googleCalendarBridge";
import { resetGoogleCalendarSync, syncGoogleCalendar } from "@/calendar/googleCalendarSync";
import type { VaultRepository } from "@/infrastructure/database/repository";

jest.mock("@/calendar/googleCalendarBridge", () => ({
  googleCalendarRequest: jest.fn(),
}));

const requestMock = googleCalendarRequest as jest.MockedFunction<typeof googleCalendarRequest>;
const page = (id: string, title: string, scheduledAt: string): Page => ({
  id,
  title,
  icon: null,
  parentId: null,
  position: id,
  stateId: "giraffle-state-open",
  categoryId: null,
  priority: null,
  scheduledAt,
  durationMinutes: 30,
  calendarColor: null,
  description: null,
  childView: "list",
  isPinned: false,
  isArchived: false,
  document: EMPTY_DOCUMENT,
  createdAt: 1,
  updatedAt: 1,
});

describe("Google Calendar synchronization", () => {
  beforeEach(async () => {
    requestMock.mockReset();
    await resetGoogleCalendarSync();
  });

  it("imports Google events as pages and exports local scheduled pages", async () => {
    const pages = [page("local-page", "Local planning", "2026-08-05T09:00")];
    requestMock.mockImplementation(async (input) => {
      if (input.method === "GET") {
        return {
          ok: true,
          status: 200,
          data: {
            items: [{
              id: "google-event",
              etag: "external-v1",
              summary: "External meeting",
              colorId: "10",
              updated: "2026-08-01T10:00:00.000Z",
              start: { date: "2026-08-06" },
              end: { date: "2026-08-07" },
            }],
            nextSyncToken: "sync-1",
          },
        };
      }
      if (input.method === "PATCH" && input.path.endsWith("/google-event")) {
        return {
          ok: true,
          status: 200,
          data: { id: "google-event", etag: "external-v2", updated: "2026-08-01T10:01:00.000Z" },
        };
      }
      if (input.method === "POST") {
        return {
          ok: true,
          status: 200,
          data: { id: "local-event", etag: "local-v1", updated: "2026-08-01T10:02:00.000Z" },
        };
      }
      throw new Error(`Unexpected request: ${input.method} ${input.path}`);
    });

    const repository = {
      async createGoogleCalendarPage(input: { title: string; scheduledAt: string; durationMinutes: number | null; calendarColor?: string | null; description?: string | null }) {
        const created = page("imported-page", input.title, input.scheduledAt);
        created.durationMinutes = input.durationMinutes;
        created.calendarColor = input.calendarColor ?? null;
        created.description = input.description ?? null;
        created.updatedAt = 2;
        pages.push(created);
        return created.id;
      },
      async organizeGoogleCalendarPage() {},
      async updatePage() {},
      async snapshot() {
        return {
          pages,
          states: [],
          categories: [],
          canvases: [],
          backlinks: [],
          inboxPageId: null,
          sync: { pending: 0, lastError: null },
        };
      },
    } as unknown as VaultRepository;
    const run = <T,>(action: (value: VaultRepository) => Promise<T>) => action(repository);

    await expect(syncGoogleCalendar(pages, run)).resolves.toEqual({
      imported: 1,
      updated: 0,
      exported: 1,
      removed: 0,
    });
    expect(pages.find((item) => item.id === "imported-page")).toMatchObject({
      title: "External meeting",
      scheduledAt: "2026-08-06",
      durationMinutes: null,
      calendarColor: "#0b8043",
    });
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({
        summary: "Local planning",
        extendedProperties: { private: { girafflePageId: "local-page" } },
      }),
    }));
  });

  it("keeps the canonical page when Google deletes its event", async () => {
    const pages = [page("local-page", "Keep the page", "2026-08-05T09:00")];
    let pass = 0;
    requestMock.mockImplementation(async (input) => {
      if (input.method === "GET") {
        pass += 1;
        return pass === 1
          ? { ok: true, status: 200, data: { items: [], nextSyncToken: "sync-1" } }
          : {
              ok: true,
              status: 200,
              data: {
                items: [{ id: "google-event", status: "cancelled", updated: "2026-08-02T10:00:00.000Z" }],
                nextSyncToken: "sync-2",
              },
            };
      }
      if (input.method === "POST") {
        return { ok: true, status: 200, data: { id: "google-event", etag: "v1", updated: "2026-08-01T10:00:00.000Z" } };
      }
      throw new Error(`Unexpected request: ${input.method} ${input.path}`);
    });
    const repository = {
      async createGoogleCalendarPage() { throw new Error("not expected"); },
      async organizeGoogleCalendarPage() {},
      async updatePage(id: string, patch: Partial<Page>) {
        const target = pages.find((item) => item.id === id);
        if (target) Object.assign(target, patch, { updatedAt: target.updatedAt + 1 });
      },
      async snapshot() {
        return { pages, states: [], categories: [], canvases: [], backlinks: [], inboxPageId: null, sync: { pending: 0, lastError: null } };
      },
    } as unknown as VaultRepository;
    const run = <T,>(action: (value: VaultRepository) => Promise<T>) => action(repository);

    await syncGoogleCalendar(pages, run);
    await expect(syncGoogleCalendar(pages, run)).resolves.toMatchObject({ removed: 1 });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ id: "local-page", scheduledAt: null, durationMinutes: null });
  });
});
