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

    await client.repository.deleteBoard(boardId);
    snapshot = await client.repository.snapshot();
    expect(snapshot.boards.some((item) => item.id === boardId)).toBe(false);
    expect(snapshot.pages.some((page) => page.id === board?.pageId)).toBe(false);
    expect(snapshot.tasks.some((item) => item.id === taskId)).toBe(false);
  });
});
