import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authHeaders,
  createHarness,
  DEVICE_ID,
  encode,
  enroll,
  VAULT_ID,
  type TestHarness,
} from "./helpers.ts";

let harness: TestHarness;

beforeEach(async () => {
  harness = await createHarness();
});

afterEach(() => {
  harness.store.close();
});

function enrollBody(harness: TestHarness, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    deviceId: DEVICE_ID,
    name: "Giraffle test device",
    signingPublicKey: encode(harness.signingPublicKey),
    agreementPublicKey: encode(harness.agreementPublicKey),
    protocolVersion: 1,
    ...overrides,
  });
}

function post(harness: TestHarness, body: string) {
  return harness.app.request(`/api/v1/vaults/${VAULT_ID}/devices`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
}

describe("device enrollment", () => {
  it("bootstraps the vault with its first device", async () => {
    const response = await enroll(harness);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ deviceId: DEVICE_ID, status: "active" });
    expect(harness.store.findVault(VAULT_ID)).toEqual({ id: VAULT_ID, protocolVersion: 1 });
  });

  it("is idempotent when the same device re-enrolls with the same key", async () => {
    expect((await enroll(harness)).status).toBe(201);

    const response = await enroll(harness);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deviceId: DEVICE_ID, status: "active" });
  });

  it("refuses a second device that no trusted device authorized", async () => {
    expect((await enroll(harness)).status).toBe(201);

    const response = await post(harness, enrollBody(harness, { deviceId: "device-beta" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "A trusted device must authorize additional enrollment",
    });
  });

  it("refuses a re-enrollment that presents a different signing key", async () => {
    expect((await enroll(harness)).status).toBe(201);

    const other = harness.crypto.signingKeyPairFromSeed(
      new Uint8Array(harness.crypto.signingSeedBytes).fill(11),
    );
    const response = await post(
      harness,
      enrollBody(harness, { signingPublicKey: encode(other.publicKey) }),
    );

    expect(response.status).toBe(409);
  });

  it("rejects malformed enrollment payloads", async () => {
    expect((await post(harness, enrollBody(harness, { protocolVersion: 2 }))).status).toBe(400);
    expect((await post(harness, enrollBody(harness, { name: "" }))).status).toBe(400);
    expect((await post(harness, enrollBody(harness, { deviceId: "bad device" }))).status).toBe(400);
    expect(
      (await post(harness, enrollBody(harness, { signingPublicKey: encode(new Uint8Array(16)) })))
        .status,
    ).toBe(400);
    expect((await post(harness, "{not json")).status).toBe(400);
  });
});
