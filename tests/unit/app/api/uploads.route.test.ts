import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    note: {
      findFirst: vi.fn(),
    },
    mediaAsset: {
      create: vi.fn(),
    },
    appSetting: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "asset-1"),
  slugify: vi.fn((value: string) => value.toLowerCase().replace(/\s+/g, "-")),
}));

const { mkdir, writeFile } = await import("node:fs/promises");
const { auth } = await import("@/lib/auth");
const { db } = await import("@/lib/db");
const { POST } = await import("@/app/api/uploads/route");

describe("POST /api/uploads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(db.note.findFirst).mockResolvedValue({ id: "note-1" } as never);
    vi.mocked(db.mediaAsset.create).mockResolvedValue({ id: "asset-row-1" } as never);
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null as never);
  });

  it("returns 401 when the upload is unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const formData = new FormData();
    formData.append("file", new File(["hello"], "image.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects files that exceed the size limit", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "too-big.png", {
        type: "image/png",
      })
    );

    const response = await POST(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Image uploads must be 10 MB or smaller",
    });
    expect(writeFile).not.toHaveBeenCalled();
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
  });

  it("rejects note references outside the current user workspace", async () => {
    vi.mocked(db.note.findFirst).mockResolvedValue(null as never);

    const formData = new FormData();
    formData.append("file", new File(["hello"], "image.png", { type: "image/png" }));
    formData.append("noteId", "foreign-note");

    const response = await POST(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Note not found" });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("stores the file and creates a media asset record for valid uploads", async () => {
    const formData = new FormData();
    formData.append("file", new File(["hello"], "Photo Test.png", { type: "image/png" }));
    formData.append("noteId", "note-1");
    formData.append("altText", "Hero image");

    const response = await POST(
      new Request("http://localhost/api/uploads", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      src: "/uploads/2026/01/asset-1-photo-test.png",
      alt: "Hero image",
    });
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(db.mediaAsset.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        noteId: "note-1",
        fileName: "Photo Test.png",
        mimeType: "image/png",
        sizeBytes: 5,
        storagePath: "/uploads/2026/01/asset-1-photo-test.png",
        altText: "Hero image",
      },
    });
  });
});
