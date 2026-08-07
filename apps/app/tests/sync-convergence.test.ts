import { documentPlainText, type TiptapDocument } from "@giraffle/domain";
import { enrollDevice } from "@/infrastructure/sync/syncClient";
import {
  createClient,
  createVaultSecrets,
  findPage,
  pageTitles,
  SYNC_CONFIG,
  VAULT_ID,
  type TestClient,
} from "./support/client";
import { createRelay, type TestRelay } from "./support/relay";
import { resetTestDatabases } from "./support/sqlite";

jest.setTimeout(30_000);

let relay: TestRelay;
let alpha: TestClient;
let beta: TestClient;

function paragraph(text: string): TiptapDocument {
  return { type: "doc", content: [{ type: "paragraph", attrs: { id: "p1" }, content: [{ type: "text", text }] }] };
}

async function bodyOf(client: TestClient, pageId: string): Promise<string> {
  const page = await findPage(client, pageId);
  return page ? documentPlainText(page.document) : "";
}

/** Both devices exchange until neither has anything left to send. */
async function settle(...clients: TestClient[]): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    for (const client of clients) {
      const outcome = await client.sync();
      expect(outcome.error).toBeNull();
    }
  }
}

beforeEach(async () => {
  resetTestDatabases();
  relay = await createRelay(VAULT_ID);
  global.fetch = relay.fetch;

  const secrets = await createVaultSecrets();
  alpha = await createClient({ deviceId: "device-alpha", secrets });
  beta = await createClient({ deviceId: "device-beta", secrets });

  // Alpha founds the vault; beta joins and is approved out of band.
  expect(await enrollDevice(SYNC_CONFIG, { vaultId: VAULT_ID, deviceId: alpha.deviceId, repository: alpha.repository })).toBe("active");
  expect(await enrollDevice(SYNC_CONFIG, { vaultId: VAULT_ID, deviceId: beta.deviceId, repository: beta.repository })).toBe("pending");
  relay.devices.get(beta.deviceId)!.status = "active";
});

describe("two devices, one vault", () => {
  it("converges on the same pages whichever device syncs first", async () => {
    const alphaPage = await alpha.repository.createPage({ title: "Written on alpha" });
    const betaPage = await beta.repository.createPage({ title: "Written on beta" });

    await settle(alpha, beta);

    expect(await pageTitles(alpha)).toEqual(["Written on alpha", "Written on beta"]);
    expect(await pageTitles(beta)).toEqual(["Written on alpha", "Written on beta"]);
    expect((await findPage(alpha, betaPage))?.title).toBe("Written on beta");
    expect((await findPage(beta, alphaPage))?.title).toBe("Written on alpha");
  });

  it("converges identically when the sync order is reversed", async () => {
    await alpha.repository.createPage({ title: "First" });
    await beta.repository.createPage({ title: "Second" });

    await settle(beta, alpha);

    expect(await pageTitles(alpha)).toEqual(["First", "Second"]);
    expect(await pageTitles(beta)).toEqual(["First", "Second"]);
  });

  it("resolves a concurrent title edit the same way on both devices", async () => {
    const pageId = await alpha.repository.createPage({ title: "Shared" });
    await settle(alpha, beta);

    // Neither device has seen the other's rename when it makes its own.
    await alpha.repository.updatePage(pageId, { title: "Renamed on alpha" });
    await beta.repository.updatePage(pageId, { title: "Renamed on beta" });

    await settle(alpha, beta);

    const onAlpha = (await findPage(alpha, pageId))?.title;
    const onBeta = (await findPage(beta, pageId))?.title;
    expect(onAlpha).toBe(onBeta);
    expect(["Renamed on alpha", "Renamed on beta"]).toContain(onAlpha);
  });

  it("keeps a move made here and a rename made there", async () => {
    const parentId = await alpha.repository.createPage({ title: "Parent" });
    const childId = await alpha.repository.createPage({ title: "Child" });
    await settle(alpha, beta);

    await alpha.repository.movePage(childId, parentId);
    await beta.repository.updatePage(childId, { title: "Renamed child" });

    await settle(alpha, beta);

    for (const client of [alpha, beta]) {
      const child = await findPage(client, childId);
      expect(child?.title).toBe("Renamed child");
      expect(child?.parentId).toBe(parentId);
    }
  });

  it("loses no text when both devices type into the same paragraph", async () => {
    const pageId = await alpha.repository.createPage({ title: "Notes" });
    await alpha.repository.saveDocument(pageId, paragraph("the quick fox"));
    await settle(alpha, beta);
    expect(await bodyOf(beta, pageId)).toBe("the quick fox");

    // One device inserts a word, the other appends, neither having seen the
    // other. Yjs must keep both instead of picking a winner.
    await alpha.repository.saveDocument(pageId, paragraph("the quick brown fox"));
    await beta.repository.saveDocument(pageId, paragraph("the quick fox jumped"));

    await settle(alpha, beta);

    const onAlpha = await bodyOf(alpha, pageId);
    const onBeta = await bodyOf(beta, pageId);
    expect(onAlpha).toBe(onBeta);
    expect(onAlpha).toContain("brown");
    expect(onAlpha).toContain("jumped");
  });

  it("keeps a task created on one device and completed on the other", async () => {
    const pageId = await alpha.repository.createPage({ title: "Chores" });
    const taskId = await alpha.repository.createTask({ pageId, content: "Water the plants" });
    await settle(alpha, beta);

    await beta.repository.updateTask(taskId, { completed: true });
    await settle(alpha, beta);

    const snapshot = await alpha.repository.snapshot();
    const task = snapshot.tasks.find((entry) => entry.id === taskId);
    expect(task?.content).toBe("Water the plants");
    expect(task?.completed).toBe(true);
  });
});

describe("idempotence", () => {
  it("changes nothing when the same record is applied a second time", async () => {
    const pageId = await alpha.repository.createPage({ title: "Only once" });
    await alpha.sync();
    await beta.sync();

    const before = await beta.repository.snapshot();
    const stored = relay.records[0]!;

    expect(await beta.repository.applyRemoteRecord(stored.encodedRecord, String(stored.serverSeq))).toBe("skipped");

    const after = await beta.repository.snapshot();
    expect(after.pages).toEqual(before.pages);
    expect(after.pages.filter((page) => page.id === pageId)).toHaveLength(1);
  });

  it("ignores a record this device wrote itself when it comes back from the relay", async () => {
    await alpha.repository.createPage({ title: "Echo" });
    await alpha.sync();

    const replay = await alpha.repository.applyRemoteRecord(
      relay.records[0]!.encodedRecord,
      String(relay.records[0]!.serverSeq),
    );

    expect(replay).toBe("skipped");
    expect(await pageTitles(alpha)).toEqual(["Echo"]);
  });
});

describe("cursor durability", () => {
  it("resumes from the stored cursor after a restart instead of replaying", async () => {
    await alpha.repository.createPage({ title: "One" });
    await alpha.repository.createPage({ title: "Two" });
    await settle(alpha, beta);

    const cursor = await beta.repository.pullCursor();
    expect(Number(cursor)).toBe(relay.records.length);

    const restarted = await beta.restart();
    expect(await restarted.repository.pullCursor()).toBe(cursor);

    const outcome = await restarted.sync();
    expect(outcome.error).toBeNull();
    expect(outcome.applied).toBe(0);
    expect(outcome.cursor).toBe(cursor);

    // The pull that followed the restart asked for everything after the cursor,
    // not from zero.
    const pulls = relay.requests.filter((entry) => entry.path.endsWith("/sync/pull"));
    expect(pulls.at(-1)?.query).toContain(`after=${cursor}`);
    expect(await pageTitles(restarted)).toEqual(["One", "Two"]);
  });

  it("walks every page when the relay hands back more than one", async () => {
    for (let index = 0; index < 7; index += 1) {
      await alpha.repository.createPage({ title: `Page ${index}` });
    }
    await alpha.sync();

    // A page size that divides the record count exactly forces the extra empty
    // request that terminates the loop.
    const outcome = await beta.sync();
    expect(outcome.error).toBeNull();
    expect((await pageTitles(beta)).length).toBe(7);
    expect(Number(await beta.repository.pullCursor())).toBe(relay.records.length);
  });

  it("syncs a board as a visible page with canonical tasks", async () => {
    const boardId = await alpha.repository.createBoard("Release board");
    const taskId = await alpha.repository.createTask({ boardId, content: "Ship build" });
    const inboxTaskId = await alpha.repository.createInboxTask("Prepare notes");
    await alpha.repository.addTaskToBoard(inboxTaskId, boardId);

    await settle(alpha, beta);

    let snapshot = await beta.repository.snapshot();
    const board = snapshot.boards.find((item) => item.id === boardId);
    expect(snapshot.pages.find((page) => page.id === board?.pageId)?.title).toBe("Release board");
    expect(snapshot.tasks.find((task) => task.id === taskId)?.pageId).toBe(board?.pageId);
    expect(snapshot.tasks.find((task) => task.id === inboxTaskId)).toMatchObject({
      boardId,
      sourceLabel: "Inbox",
    });
    expect(snapshot.pages.find((page) => page.id === snapshot.tasks.find((task) => task.id === inboxTaskId)?.pageId)?.title).toBe("Inbox");

    await alpha.repository.removeTaskFromBoard(inboxTaskId);
    await alpha.repository.updateBoard(boardId, { title: "Launch board" });
    await settle(alpha, beta);

    snapshot = await beta.repository.snapshot();
    expect(snapshot.pages.find((page) => page.id === board?.pageId)?.title).toBe("Launch board");
    expect(snapshot.tasks.find((task) => task.id === inboxTaskId)).toMatchObject({
      boardId: null,
      sourceLabel: "Inbox",
    });

    await alpha.repository.deleteBoard(boardId);
    await settle(alpha, beta);

    snapshot = await beta.repository.snapshot();
    expect(snapshot.boards.some((item) => item.id === boardId)).toBe(false);
    expect(snapshot.pages.some((page) => page.id === board?.pageId)).toBe(false);
    expect(snapshot.tasks.some((task) => task.id === taskId)).toBe(false);
    expect(snapshot.tasks.some((task) => task.id === inboxTaskId)).toBe(true);
  });
});

describe("failure tolerance", () => {
  it("leaves local data intact and usable when the relay is unreachable", async () => {
    const pageId = await alpha.repository.createPage({ title: "Offline" });
    relay.fail(1, "Network request failed");

    const outcome = await alpha.sync();
    expect(outcome.error).toBe("Network request failed");
    expect(outcome.applied).toBe(0);

    expect(await pageTitles(alpha)).toEqual(["Offline"]);
    await alpha.repository.updatePage(pageId, { title: "Still editable" });
    expect(await pageTitles(alpha)).toEqual(["Still editable"]);

    const recovered = await alpha.sync();
    expect(recovered.error).toBeNull();
  });

  it("surfaces a record it cannot open without stalling the cursor", async () => {
    await alpha.repository.createPage({ title: "Readable" });
    await alpha.sync();

    // A record from a device beta has never heard of cannot be verified.
    const stranger = await createClient({
      deviceId: "device-gamma",
      secrets: { vaultRootKey: alpha.keys.vaultRootKey, contentKey: alpha.keys.contentKey, locatorKey: alpha.keys.locatorKey },
    });
    await stranger.repository.createPage({ title: "Unverifiable" });
    const pending = await stranger.repository.pendingRecords();
    relay.records.push({ serverSeq: relay.records.length + 1, encodedRecord: pending[0]!.record });

    const outcome = await beta.sync();
    expect(outcome.error).toBeNull();
    expect(outcome.deferred).toBe(1);
    expect(await beta.repository.deferredRecordCount()).toBe(1);
    expect(Number(await beta.repository.pullCursor())).toBe(relay.records.length);
    expect(await pageTitles(beta)).toEqual(["Readable"]);
  });

  it("does not apply a record twice when two runs overlap", async () => {
    await alpha.repository.createPage({ title: "Concurrent" });
    await alpha.sync();

    const [first, second] = await Promise.all([beta.sync(), beta.sync()]);

    // The second caller joins the run already in flight rather than starting a
    // second exchange, so the record is applied exactly once.
    expect(first).toBe(second);
    expect(first.applied).toBe(1);
    expect(await pageTitles(beta)).toEqual(["Concurrent"]);
    expect((await beta.repository.snapshot()).pages).toHaveLength(1);
  });
});
