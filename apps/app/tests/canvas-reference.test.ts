import type { CanvasElement } from "@giraffle/domain";
import { createClient, createVaultSecrets } from "./support/client";
import { resetTestDatabases } from "./support/sqlite";

beforeEach(() => {
  resetTestDatabases();
});

function reference(
  id: string,
  customData: NonNullable<CanvasElement["customData"]>,
): CanvasElement {
  return {
    id,
    type: "rectangle",
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    customData,
  };
}

describe("canvas entity references", () => {
  it("indexes page and canonical task links from the saved scene", async () => {
    const client = await createClient({
      deviceId: "canvas-reference-device",
      secrets: await createVaultSecrets(),
    });
    const pageId = await client.repository.createPage({ title: "Plan" });
    const taskId = await client.repository.createInboxTask("Ship build");
    const canvasId = await client.repository.createCanvas();

    await client.repository.saveCanvas(canvasId, [
      reference("page-element", { girafflePageId: pageId }),
      reference("task-element", { giraffleTaskId: taskId }),
    ]);

    expect(
      await client.database.getAllAsync(
        "SELECT element_id,page_id FROM canvas_references WHERE canvas_id=?",
        canvasId,
      ),
    ).toEqual([{ element_id: "page-element", page_id: pageId }]);
    expect(
      await client.database.getAllAsync(
        "SELECT element_id,task_id FROM canvas_task_references WHERE canvas_id=?",
        canvasId,
      ),
    ).toEqual([{ element_id: "task-element", task_id: taskId }]);

    await client.repository.saveCanvas(canvasId, []);
    expect(
      await client.database.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) count FROM canvas_task_references WHERE canvas_id=?",
        canvasId,
      ),
    ).toEqual({ count: 0 });
  });
});
