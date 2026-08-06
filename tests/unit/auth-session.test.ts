import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: mocks.findUnique } },
}));

import { requireAuthenticatedUser } from "@/lib/auth-session";

describe("requireAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a JWT whose user was deleted or reset", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "stale-user" } });
    mocks.findUnique.mockResolvedValue(null);

    await expect(requireAuthenticatedUser()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "stale-user" },
      select: { id: true },
    });
  });

  it("returns only an existing database user", async () => {
    const session = { user: { id: "active-user" } };
    mocks.auth.mockResolvedValue(session);
    mocks.findUnique.mockResolvedValue({ id: "active-user" });

    await expect(requireAuthenticatedUser()).resolves.toEqual({
      session,
      userId: "active-user",
    });
  });
});
