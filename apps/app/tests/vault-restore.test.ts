import { EMPTY_DOCUMENT, type CanvasElement } from "@giraffle/domain";
import { createClient, createVaultSecrets } from "./support/client";

describe("vault archive restore", () => {
  it("round-trips active and archived canonical data into an empty vault", async () => {
    const source = await createClient({
      deviceId: "archive-source",
      secrets: await createVaultSecrets(),
      vaultId: "source-vault",
    });
    const boardId = await source.repository.createBoard("Release");
    const board = (await source.repository.snapshot()).boards.find((entry) => entry.id === boardId)!;
    await source.repository.updatePage(board.pageId, { icon: "🚀" });
    const column = (await source.repository.snapshot()).columns.find((entry) => entry.boardId === boardId)!;

    const researchPageId = await source.repository.createPage({ title: "Research" });
    await source.repository.saveDocument(researchPageId, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "paragraph-1" },
          content: [{ type: "text", text: "[[Release]] planning" }],
        },
      ],
    });
    const taskId = await source.repository.createTask({ pageId: researchPageId, content: "Ship it" });
    await source.repository.updateTask(taskId, {
      completed: true,
      priority: "do",
      dueDate: "2026-08-09T09:00:00.000Z",
      durationMinutes: 45,
      description: "Final check",
    });
    await source.repository.addTaskToBoard(taskId, boardId, column.id);

    const archivedPageId = await source.repository.createPage({ title: "Archived work" });
    const archivedTaskId = await source.repository.createTask({
      pageId: archivedPageId,
      content: "Remember me",
    });
    await source.repository.archivePage(archivedPageId);

    const canvasId = await source.repository.createCanvas("Map");
    const element: CanvasElement = {
      id: "canvas-element-1",
      type: "rectangle",
      version: 1,
      versionNonce: 1,
      isDeleted: false,
      customData: { girafflePageId: researchPageId, giraffleTaskId: taskId },
    };
    await source.repository.saveCanvas(canvasId, [element], { zoom: { value: 1.2 } });

    const exported = await source.repository.archiveData();
    expect(exported.tasks.some((task) => task.id === archivedTaskId)).toBe(true);
    expect((await source.repository.snapshot()).tasks.some((task) => task.id === archivedTaskId)).toBe(false);

    const destination = await createClient({
      deviceId: "archive-destination",
      secrets: await createVaultSecrets(),
      vaultId: "destination-vault",
    });
    await destination.repository.restoreArchive(exported);

    expect(await destination.repository.archiveData()).toEqual(exported);
    const pending = await destination.repository.pendingRecords();
    expect(pending.length).toBeGreaterThan(0);
    expect(await destination.database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM trusted_devices WHERE id<>?",
      destination.deviceId,
    )).toEqual({ count: 0 });

    // A later joined device receives the imported entities through ordinary
    // signed sync records; no archive or source-device identity is replicated.
    const replica = await createClient({
      deviceId: "archive-replica",
      secrets: {
        vaultRootKey: destination.keys.vaultRootKey,
        contentKey: destination.keys.contentKey,
        locatorKey: destination.keys.locatorKey,
      },
      vaultId: "destination-vault",
    });
    await replica.repository.prepareForJoinedVault();
    const destinationIdentity = destination.repository.deviceIdentity();
    await replica.repository.rememberDevices([
      {
        deviceId: destinationIdentity.deviceId,
        name: "Importing device",
        status: "active",
        signingPublicKey: destinationIdentity.signingPublicKey,
        agreementPublicKey: destinationIdentity.agreementPublicKey,
      },
    ]);
    for (const [index, record] of pending.entries()) {
      await replica.repository.applyRemoteRecord(record.record, String(index + 1));
    }

    const withoutTimes = (value: Awaited<ReturnType<typeof destination.repository.archiveData>>) => ({
      ...value,
      pages: value.pages.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...page }) => page),
      tasks: value.tasks.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...task }) => task),
      boards: value.boards.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...board }) => board),
      canvases: value.canvases.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...canvas }) => canvas),
    });
    expect(withoutTimes(await replica.repository.archiveData())).toEqual(withoutTimes(exported));
  });

  it("refuses to merge a backup into a non-empty workspace", async () => {
    const source = await createClient({
      deviceId: "non-empty-source",
      secrets: await createVaultSecrets(),
    });
    const pageId = await source.repository.createPage({ title: "Source" });
    await source.repository.saveDocument(pageId, EMPTY_DOCUMENT);
    const data = await source.repository.archiveData();

    const destination = await createClient({
      deviceId: "non-empty-destination",
      secrets: await createVaultSecrets(),
      vaultId: "non-empty-destination-vault",
    });
    await destination.repository.createPage({ title: "Keep me" });

    await expect(destination.repository.restoreArchive(data)).rejects.toThrow(
      "empty workspace",
    );
    expect((await destination.repository.snapshot()).pages.map((page) => page.title)).toContain("Keep me");
  });

  it("refuses restore after any successful relay exchange", async () => {
    const source = await createClient({
      deviceId: "sync-history-source",
      secrets: await createVaultSecrets(),
    });
    await source.repository.createPage({ title: "Source" });
    const data = await source.repository.archiveData();

    const destination = await createClient({
      deviceId: "sync-history-destination",
      secrets: await createVaultSecrets(),
      vaultId: "sync-history-destination-vault",
    });
    await destination.database.runAsync(
      "UPDATE sync_cursors SET last_success_at=? WHERE vault_id=?",
      Date.now(),
      "sync-history-destination-vault",
    );

    await expect(destination.repository.restoreArchive(data)).rejects.toThrow(
      "never been synced",
    );
  });

  it("refuses restore after an ambiguous failed relay attempt", async () => {
    const source = await createClient({
      deviceId: "sync-error-source",
      secrets: await createVaultSecrets(),
    });
    await source.repository.createPage({ title: "Source" });
    const data = await source.repository.archiveData();

    const destination = await createClient({
      deviceId: "sync-error-destination",
      secrets: await createVaultSecrets(),
      vaultId: "sync-error-destination-vault",
    });
    await destination.repository.recordSyncError("connection closed after upload");

    await expect(destination.repository.restoreArchive(data)).rejects.toThrow(
      "never been synced",
    );
  });

  it("rejects an invalid tree before changing storage", async () => {
    const client = await createClient({
      deviceId: "invalid-tree-destination",
      secrets: await createVaultSecrets(),
      vaultId: "invalid-tree-vault",
    });
    const data = await client.repository.archiveData();
    data.pages.push({
      id: "cycle-a",
      title: "A",
      icon: null,
      parentId: "cycle-b",
      position: "a",
      isPinned: false,
      isArchived: false,
      document: EMPTY_DOCUMENT,
      createdAt: 1,
      updatedAt: 1,
    });
    data.pages.push({
      id: "cycle-b",
      title: "B",
      icon: null,
      parentId: "cycle-a",
      position: "b",
      isPinned: false,
      isArchived: false,
      document: EMPTY_DOCUMENT,
      createdAt: 1,
      updatedAt: 1,
    });

    await expect(client.repository.restoreArchive(data)).rejects.toThrow("invalid page tree");
    expect((await client.repository.snapshot()).pages).toEqual([]);
  });
});
