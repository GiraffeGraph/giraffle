import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../../package.json";
import { compareVersions, getAppUpdateStatus } from "@/domain/update/update.service";

describe("update.service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.APP_UPDATE_REPOSITORY;
  });

  it("compares semantic versions correctly", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
    expect(compareVersions("v2.0.0", "2.0.1")).toBe(-1);
  });

  it("marks updates as available when GitHub has a newer release", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: "v0.2.0",
          name: "v0.2.0",
          html_url: "https://github.com/GiraffeGraph/giraffle/releases/tag/v0.2.0",
          published_at: "2026-04-12T10:00:00.000Z",
          body: "- New feature\n- Bug fixes",
        }),
      })
    );

    const status = await getAppUpdateStatus();

    expect(status.currentVersion).toBe(packageJson.version);
    expect(status.latestVersion).toBe("0.2.0");
    expect(status.updateAvailable).toBe(true);
    expect(status.error).toBeNull();
  });

  it("returns a non-fatal error when the release check fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      })
    );

    const status = await getAppUpdateStatus();

    expect(status.updateAvailable).toBe(false);
    expect(status.latestVersion).toBeNull();
    expect(status.error).toContain("403");
  });
});
