import { describe, expect, it } from "vitest";
import {
  buildSecretPreview,
  decryptSecretValue,
  encryptSecretValue,
} from "@/lib/secret-box";

describe("secret-box", () => {
  it("encrypts and decrypts values deterministically with the same seed", () => {
    const payload = encryptSecretValue("sk-test-123456", "seed-for-tests");

    expect(payload.startsWith("v1:")).toBe(true);
    expect(decryptSecretValue(payload, "seed-for-tests")).toBe("sk-test-123456");
  });

  it("builds masked previews for secret values", () => {
    expect(buildSecretPreview("sk-test-123456")).toMatch(/•+/);
    expect(buildSecretPreview("sk-test-123456")?.endsWith("3456")).toBe(true);
  });
});
