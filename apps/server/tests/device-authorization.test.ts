import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeSignedSyncRecord, zeroRecordHash } from "@giraffle/protocol";
import { DEVICE_STATEMENT_SKEW_MS } from "../src/device-statement.ts";
import {
  approveSecondDevice,
  authHeaders,
  buildRecord,
  createHarness,
  DEVICE_ID,
  encode,
  enroll,
  enrollSecondDevice,
  postAuthorization,
  pull,
  push,
  SECOND_DEVICE_ID,
  sealGrant,
  signAuthorization,
  VAULT_ID,
  type TestHarness,
} from "./helpers.ts";

let harness: TestHarness;

beforeEach(async () => {
  harness = await createHarness();
  expect((await enroll(harness)).status).toBe(201);
});

afterEach(() => {
  harness.store.close();
});

function fetchGrant(deviceId = SECOND_DEVICE_ID) {
  return harness.app.request(`/api/v1/vaults/${VAULT_ID}/devices/${deviceId}/grant`, {
    headers: authHeaders(),
  });
}

/** The second device's own first record, signed by its own identity key. */
function secondDeviceRecord(sequence = 1) {
  return buildRecord(harness, {
    sequence,
    deviceId: SECOND_DEVICE_ID,
    signingPrivateKey: harness.second.signingPrivateKey,
    previousRecordHash: zeroRecordHash(),
  });
}

describe("pending devices", () => {
  it("refuses push and pull before approval, allows both after, and refuses again after revocation", async () => {
    expect((await enrollSecondDevice(harness)).status).toBe(202);

    const pendingPush = await push(harness, [secondDeviceRecord()], undefined, SECOND_DEVICE_ID);
    expect(pendingPush.status).toBe(403);
    expect(await pendingPush.json()).toEqual({
      error: "This device is not authorized to sync this vault",
    });

    const pendingPull = await pull(harness, "", undefined, VAULT_ID, SECOND_DEVICE_ID);
    expect(pendingPull.status).toBe(403);

    const grant = sealGrant(harness, harness.second);
    const approved = await postAuthorization(harness, { action: "approve", grant });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toEqual({ deviceId: SECOND_DEVICE_ID, status: "active" });

    const activePush = await push(harness, [secondDeviceRecord()], undefined, SECOND_DEVICE_ID);
    expect(activePush.status).toBe(200);
    const activePull = await pull(harness, "", undefined, VAULT_ID, SECOND_DEVICE_ID);
    expect(activePull.status).toBe(200);
    expect(((await activePull.json()) as { records: unknown[] }).records).toHaveLength(1);

    const revoked = await postAuthorization(harness, { action: "revoke" });
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ deviceId: SECOND_DEVICE_ID, status: "revoked" });

    expect(
      (await push(harness, [secondDeviceRecord(2)], undefined, SECOND_DEVICE_ID)).status,
    ).toBe(403);
    expect((await pull(harness, "", undefined, VAULT_ID, SECOND_DEVICE_ID)).status).toBe(403);
  });

  it("refuses sync when the caller does not identify itself at all", async () => {
    expect((await pull(harness, "", undefined, VAULT_ID, null)).status).toBe(400);
    expect((await push(harness, [buildRecord(harness, { sequence: 1 })], undefined, null)).status).toBe(
      400,
    );
  });

  it("refuses a record signed by a device other than the caller", async () => {
    await approveSecondDevice(harness);

    // The approved second device presents the first device's record.
    const response = await push(
      harness,
      [buildRecord(harness, { sequence: 1 })],
      undefined,
      SECOND_DEVICE_ID,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Record device is not active" });
  });

  it("hands the sealed grant to the waiting device once it exists", async () => {
    expect((await enrollSecondDevice(harness)).status).toBe(202);

    const before = await fetchGrant();
    expect(before.status).toBe(200);
    expect(await before.json()).toEqual({
      deviceId: SECOND_DEVICE_ID,
      status: "pending",
      grant: null,
      approvedByDeviceId: null,
    });

    const { grant } = await approveSecondDevice(harness);
    const after = await fetchGrant();
    expect(await after.json()).toEqual({
      deviceId: SECOND_DEVICE_ID,
      status: "active",
      grant: encode(grant),
      approvedByDeviceId: DEVICE_ID,
    });
  });

  it("drops the grant when the device is revoked", async () => {
    await approveSecondDevice(harness);
    expect((await postAuthorization(harness, { action: "revoke" })).status).toBe(200);

    expect(await (await fetchGrant()).json()).toMatchObject({
      status: "revoked",
      grant: null,
    });
  });
});

describe("authorization statements", () => {
  beforeEach(async () => {
    expect((await enrollSecondDevice(harness)).status).toBe(202);
  });

  it("rejects an approval signed by a key the acting device does not own", async () => {
    const impostor = harness.crypto.signingKeyPairFromSeed(
      new Uint8Array(harness.crypto.signingSeedBytes).fill(99),
    );
    const grant = sealGrant(harness, harness.second);
    const signed = signAuthorization(harness, { action: "approve", grant });

    const response = await harness.app.request(
      `/api/v1/vaults/${VAULT_ID}/devices/${SECOND_DEVICE_ID}/authorization`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          statement: encode(signed.statement),
          signature: encode(harness.crypto.sign(signed.statement, impostor.privateKey)),
          grant: encode(grant),
        }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Authorization signature verification failed",
    });
    expect(harness.store.findDevice(SECOND_DEVICE_ID)?.status).toBe("pending");
  });

  it("rejects an approval whose acting device is only pending", async () => {
    const third = harness.crypto.signingKeyPairFromSeed(
      new Uint8Array(harness.crypto.signingSeedBytes).fill(31),
    );
    const response = await postAuthorization(harness, {
      action: "approve",
      grant: sealGrant(harness, harness.second),
      acting: {
        deviceId: SECOND_DEVICE_ID,
        signingPublicKey: harness.second.signingPublicKey,
        signingPrivateKey: harness.second.signingPrivateKey,
        agreementPublicKey: harness.second.agreementPublicKey,
        agreementPrivateKey: harness.second.agreementPrivateKey,
      },
      subject: {
        deviceId: DEVICE_ID,
        signingPublicKey: harness.signingPublicKey,
        signingPrivateKey: third.privateKey,
        agreementPublicKey: harness.agreementPublicKey,
        agreementPrivateKey: new Uint8Array(32),
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only a trusted device can authorize another",
    });
  });

  it("rejects an approval whose grant does not hash to the signed value", async () => {
    const signedGrant = sealGrant(harness, harness.second);
    const signed = signAuthorization(harness, { action: "approve", grant: signedGrant });

    const response = await harness.app.request(
      `/api/v1/vaults/${VAULT_ID}/devices/${SECOND_DEVICE_ID}/authorization`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          statement: encode(signed.statement),
          signature: encode(signed.signature),
          grant: encode(harness.crypto.seal(new Uint8Array(32).fill(1), harness.second.agreementPublicKey)),
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Sealed access grant does not match the signed hash",
    });
  });

  it("rejects an approval that names public keys the relay does not hold", async () => {
    const substituted = harness.crypto.agreementKeyPairFromSeed(
      new Uint8Array(harness.crypto.agreementSeedBytes).fill(77),
    );
    const grant = harness.crypto.seal(harness.vaultRootKey, substituted.publicKey);

    const response = await postAuthorization(harness, {
      action: "approve",
      grant,
      subjectAgreementPublicKey: substituted.publicKey,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Statement does not match the enrolled device keys",
    });
  });

  it("rejects a statement that is outside the accepted time window", async () => {
    const response = await postAuthorization(harness, {
      action: "approve",
      grant: sealGrant(harness, harness.second),
      issuedAtMs: Date.now() - DEVICE_STATEMENT_SKEW_MS - 1_000,
    });

    expect(response.status).toBe(403);
  });

  it("refuses to replay a spent statement, so a captured approval cannot undo a revocation", async () => {
    const grant = sealGrant(harness, harness.second);
    const signed = signAuthorization(harness, { action: "approve", grant });
    const body = JSON.stringify({
      statement: encode(signed.statement),
      signature: encode(signed.signature),
      grant: encode(grant),
    });
    const send = () =>
      harness.app.request(`/api/v1/vaults/${VAULT_ID}/devices/${SECOND_DEVICE_ID}/authorization`, {
        method: "POST",
        headers: authHeaders(),
        body,
      });

    expect((await send()).status).toBe(200);
    expect((await postAuthorization(harness, { action: "revoke" })).status).toBe(200);

    const replay = await send();
    expect(replay.status).toBe(409);
    expect(await replay.json()).toEqual({
      error: "This authorization statement was already used",
    });
    expect(harness.store.findDevice(SECOND_DEVICE_ID)?.status).toBe("revoked");
  });

  it("refuses a device that tries to authorize itself", async () => {
    const response = await postAuthorization(harness, {
      action: "approve",
      grant: sealGrant(harness, harness.second),
      acting: harness.second,
      subject: harness.second,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "A device cannot authorize itself" });
  });

  it("refuses a revocation that smuggles a grant hash", async () => {
    const response = await postAuthorization(harness, {
      action: "revoke",
      grant: sealGrant(harness, harness.second),
    });

    expect(response.status).toBe(400);
  });
});

describe("relay blindness for sealed grants", () => {
  it("stores the grant byte-for-byte and never learns the key inside it", async () => {
    const { grant } = await approveSecondDevice(harness);

    const stored = harness.store.findDeviceGrant(SECOND_DEVICE_ID);
    expect(stored).toBeDefined();
    expect(Buffer.from(stored!)).toEqual(Buffer.from(grant));

    // Everything the relay persisted about this vault, concatenated.
    const persisted = Buffer.concat([
      Buffer.from(stored!),
      ...harness.store
        .listDevices(VAULT_ID)
        .flatMap((device) => [
          Buffer.from(device.signingPublicKey),
          Buffer.from(device.agreementPublicKey),
          Buffer.from(device.name, "utf8"),
        ]),
    ]);
    expect(persisted.includes(Buffer.from(harness.vaultRootKey))).toBe(false);

    // Only the recipient's X25519 private key opens it, and that key never left
    // the second device.
    expect(
      Buffer.from(
        harness.crypto.openSealed(
          stored!,
          harness.second.agreementPublicKey,
          harness.second.agreementPrivateKey,
        ),
      ),
    ).toEqual(Buffer.from(harness.vaultRootKey));
    expect(() =>
      harness.crypto.openSealed(stored!, harness.agreementPublicKey, harness.signingPrivateKey.slice(0, 32)),
    ).toThrow();
  });

  it("keeps pulled records opaque to the relay after a second device joins", async () => {
    await approveSecondDevice(harness);
    const record = secondDeviceRecord();
    expect((await push(harness, [record], undefined, SECOND_DEVICE_ID)).status).toBe(200);

    const body = (await (
      await pull(harness, "", undefined, VAULT_ID, SECOND_DEVICE_ID)
    ).json()) as { records: { encodedRecord: string }[] };

    expect(body.records[0]!.encodedRecord).toBe(encode(encodeSignedSyncRecord(record)));
    expect(Buffer.from(body.records[0]!.encodedRecord, "base64url").includes(Buffer.from("note 1"))).toBe(
      false,
    );
  });
});
