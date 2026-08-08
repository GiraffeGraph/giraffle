import { decodeCanonical, encodeCanonical } from "@giraffle/protocol";
import { EMPTY_DOCUMENT, type CanvasElement } from "@giraffle/domain";
import {
  createVaultArchive,
  openVaultArchive,
  summarizeVaultArchive,
  type VaultArchiveData,
} from "@/infrastructure/archive/vaultArchive";
import { initializeCrypto } from "@/sync/cryptoProvider";

const PASSWORD = "correct horse battery staple";

function archiveData(): VaultArchiveData {
  const now = 1_700_000_000_000;
  const element: CanvasElement = {
    id: "element-1",
    type: "rectangle",
    version: 1,
    versionNonce: 2,
    isDeleted: false,
    customData: { girafflePageId: "page-board", giraffleTaskId: "task-1" },
    x: 12.5,
  };
  return {
    pages: [
      {
        id: "page-board",
        title: "Release",
        icon: "🚀",
        parentId: null,
        position: "a0",
        isPinned: true,
        isArchived: false,
        document: EMPTY_DOCUMENT,
        createdAt: now,
        updatedAt: now + 1,
      },
      {
        id: "page-notes",
        title: "Notes",
        icon: null,
        parentId: "page-board",
        position: "a1",
        isPinned: false,
        isArchived: false,
        document: {
          type: "doc",
          content: [{ type: "paragraph", attrs: { id: "paragraph-1" }, content: [{ type: "text", text: "Hello" }] }],
        },
        createdAt: now,
        updatedAt: now + 2,
      },
    ],
    statuses: [{ id: "status-1", title: "Active", color: null, position: "1" }],
    boards: [
      {
        id: "board-1",
        pageId: "page-board",
        statusId: "status-1",
        title: "Release",
        icon: "🚀",
        position: "1",
        createdAt: now,
        updatedAt: now + 1,
      },
    ],
    columns: [
      { id: "column-1", boardId: "board-1", title: "To do", color: null, position: "1" },
    ],
    tasks: [
      {
        id: "task-1",
        pageId: "page-notes",
        boardId: "board-1",
        columnId: "column-1",
        content: "Ship it",
        completed: false,
        priority: "do",
        dueDate: "2026-08-09T09:00:00.000Z",
        durationMinutes: 30,
        description: "Final check",
        position: "1",
        sourcePosition: "a0",
        boardPosition: "1",
        sourceLabel: "Notes",
        createdAt: now,
        updatedAt: now + 3,
      },
    ],
    canvases: [
      {
        id: "canvas-1",
        title: "Map",
        elements: [element],
        appState: { zoom: { value: 1.25 } },
        createdAt: now,
        updatedAt: now + 4,
      },
    ],
  };
}

beforeAll(async () => {
  await initializeCrypto();
});

describe("encrypted vault archives", () => {
  it("round-trips every canonical workspace entity", () => {
    const data = archiveData();
    const encoded = createVaultArchive(data, "source-vault", PASSWORD);
    const opened = openVaultArchive(encoded, PASSWORD);

    expect(opened.sourceVaultId).toBe("source-vault");
    expect(opened.data).toEqual(data);
    expect(summarizeVaultArchive(opened)).toMatchObject({
      pages: 2,
      tasks: 1,
      boards: 1,
      canvases: 1,
    });
  });

  it("does not open with the wrong password", () => {
    const encoded = createVaultArchive(archiveData(), "source-vault", PASSWORD);
    expect(() => openVaultArchive(encoded, "this password is wrong")).toThrow(
      "incorrect or the file is damaged",
    );
  });

  it("authenticates the complete encrypted payload", () => {
    const encoded = createVaultArchive(archiveData(), "source-vault", PASSWORD);
    const envelope = decodeCanonical(encoded) as Record<string, unknown>;
    const ciphertext = (envelope.ciphertext as Uint8Array).slice();
    ciphertext[ciphertext.length - 1] = ciphertext[ciphertext.length - 1]! ^ 1;
    const tampered = encodeCanonical({ ...envelope, ciphertext });

    expect(() => openVaultArchive(tampered, PASSWORD)).toThrow(
      "incorrect or the file is damaged",
    );
  });

  it("rejects broken canonical relationships before export", () => {
    const data = archiveData();
    data.tasks[0] = { ...data.tasks[0]!, columnId: "missing-column" };

    expect(() => createVaultArchive(data, "source-vault", PASSWORD)).toThrow(
      "invalid board placement",
    );
  });

  it("rejects page cycles before export", () => {
    const data = archiveData();
    data.pages[0] = { ...data.pages[0]!, parentId: "page-notes" };

    expect(() => createVaultArchive(data, "source-vault", PASSWORD)).toThrow(
      "page cycle",
    );
  });

  it("rejects dangling canonical canvas references", () => {
    const data = archiveData();
    data.canvases[0]!.elements[0] = {
      ...data.canvases[0]!.elements[0]!,
      customData: { giraffleTaskId: "missing-task" },
    };

    expect(() => createVaultArchive(data, "source-vault", PASSWORD)).toThrow(
      "refers to a missing task",
    );
  });
});
