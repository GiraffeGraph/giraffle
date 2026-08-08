import { createClient, createVaultSecrets } from "./support/client";
import { resetTestDatabases } from "./support/sqlite";

beforeEach(() => {
  resetTestDatabases();
});

describe("quick tasks", () => {
  it("creates unscheduled tasks in one visible Inbox page", async () => {
    const client = await createClient({
      deviceId: "quick-task-device",
      secrets: await createVaultSecrets(),
    });

    const firstId = await client.repository.createInboxTask("Capture idea");
    const secondId = await client.repository.createInboxTask("Reply later");
    const snapshot = await client.repository.snapshot();
    const inboxPages = snapshot.pages.filter((page) => page.title === "Inbox");
    const first = snapshot.tasks.find((task) => task.id === firstId);
    const second = snapshot.tasks.find((task) => task.id === secondId);

    expect(inboxPages).toHaveLength(1);
    expect(first?.pageId).toBe(inboxPages[0]?.id);
    expect(second?.pageId).toBe(inboxPages[0]?.id);
    expect(first).toMatchObject({
      boardId: null,
      columnId: null,
      dueDate: null,
      durationMinutes: null,
      priority: null,
      sourceLabel: "Inbox",
    });
  });

  it("restores the existing Inbox instead of creating a duplicate", async () => {
    const client = await createClient({
      deviceId: "archived-inbox-device",
      secrets: await createVaultSecrets(),
    });

    const firstId = await client.repository.createInboxTask("First");
    const first = (await client.repository.snapshot()).tasks.find((task) => task.id === firstId);
    await client.repository.archivePage(first!.pageId);
    expect((await client.repository.snapshot()).tasks).toHaveLength(0);

    const secondId = await client.repository.createInboxTask("Second");
    const snapshot = await client.repository.snapshot();
    expect(snapshot.pages.filter((page) => page.title === "Inbox")).toHaveLength(1);
    expect(snapshot.pages.find((page) => page.id === first?.pageId)?.isArchived).toBe(false);
    expect(snapshot.tasks.map((task) => task.id).sort()).toEqual([firstId, secondId].sort());
  });
});
