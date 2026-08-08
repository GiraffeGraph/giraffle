import { createClient, createVaultSecrets } from "./support/client";
import { resetTestDatabases } from "./support/sqlite";

beforeEach(() => {
  resetTestDatabases();
});

describe("boards are pages", () => {
  it("uses one visible page as the board task source", async () => {
    const client = await createClient({
      deviceId: "board-page-device",
      secrets: await createVaultSecrets(),
    });

    const boardId = await client.repository.createBoard("Launch plan");
    let snapshot = await client.repository.snapshot();
    const board = snapshot.boards.find((item) => item.id === boardId);

    expect(board).toBeDefined();
    expect(snapshot.pages.find((page) => page.id === board?.pageId)?.title).toBe("Launch plan");

    const taskId = await client.repository.createTask({ boardId, content: "Prepare brief" });
    snapshot = await client.repository.snapshot();
    const task = snapshot.tasks.find((item) => item.id === taskId);

    expect(task?.pageId).toBe(board?.pageId);
    expect(task?.boardId).toBe(boardId);

    await client.repository.updateBoard(boardId, { title: "Release plan" });
    snapshot = await client.repository.snapshot();
    expect(snapshot.pages.find((page) => page.id === board?.pageId)?.title).toBe("Release plan");

    await client.repository.updatePage(board!.pageId, { title: "Launch board" });
    snapshot = await client.repository.snapshot();
    expect(snapshot.boards.find((item) => item.id === boardId)?.title).toBe("Launch board");

    await client.repository.deleteBoard(boardId);
    snapshot = await client.repository.snapshot();
    expect(snapshot.boards.some((item) => item.id === boardId)).toBe(false);
    expect(snapshot.pages.some((page) => page.id === board?.pageId)).toBe(false);
    expect(snapshot.tasks.some((item) => item.id === taskId)).toBe(false);
  });

  it("can place an existing task on a board without changing its source page", async () => {
    const client = await createClient({
      deviceId: "board-assignment-device",
      secrets: await createVaultSecrets(),
    });

    const taskId = await client.repository.createInboxTask("Prepare brief");
    const boardId = await client.repository.createBoard("Launch plan");
    await client.repository.addTaskToBoard(taskId, boardId);

    let task = (await client.repository.snapshot()).tasks.find((item) => item.id === taskId);
    expect(task).toMatchObject({ boardId, sourceLabel: "Inbox" });
    expect((await client.repository.snapshot()).pages.find((page) => page.id === task?.pageId)?.title).toBe("Inbox");

    await client.repository.removeTaskFromBoard(taskId);
    task = (await client.repository.snapshot()).tasks.find((item) => item.id === taskId);
    expect(task).toMatchObject({ boardId: null, columnId: null, sourceLabel: "Inbox" });

    await client.repository.addTaskToBoard(taskId, boardId);
    await client.repository.deleteBoard(boardId);
    task = (await client.repository.snapshot()).tasks.find((item) => item.id === taskId);
    expect(task).toMatchObject({ boardId: null, columnId: null, sourceLabel: "Inbox" });
  });

  it("deleting a task source page removes its board placement too", async () => {
    const client = await createClient({
      deviceId: "source-page-lifecycle-device",
      secrets: await createVaultSecrets(),
    });

    const taskId = await client.repository.createInboxTask("Prepare brief");
    const boardId = await client.repository.createBoard("Launch plan");
    await client.repository.addTaskToBoard(taskId, boardId);
    const task = (await client.repository.snapshot()).tasks.find((item) => item.id === taskId);

    await client.repository.deletePage(task!.pageId);
    const snapshot = await client.repository.snapshot();
    expect(snapshot.tasks.some((item) => item.id === taskId)).toBe(false);
    expect(snapshot.boards.some((item) => item.id === boardId)).toBe(true);
  });

  it("keeps board and page deletion in one lifecycle", async () => {
    const client = await createClient({
      deviceId: "board-lifecycle-device",
      secrets: await createVaultSecrets(),
    });

    const parentId = await client.repository.createPage({ title: "Area" });
    const boardId = await client.repository.createBoard("Launch plan");
    const board = (await client.repository.snapshot()).boards.find((item) => item.id === boardId);
    expect(board).toBeDefined();

    await client.repository.movePage(board!.pageId, parentId);
    await expect(client.repository.archivePage(parentId)).rejects.toThrow(
      "A board page cannot be archived",
    );

    await client.repository.deletePage(parentId);
    const snapshot = await client.repository.snapshot();
    expect(snapshot.pages.some((page) => page.id === parentId || page.id === board?.pageId)).toBe(false);
    expect(snapshot.boards.some((item) => item.id === boardId)).toBe(false);
  });
});
