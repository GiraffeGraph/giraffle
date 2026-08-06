import { enrollDevice, listDevices } from "@/infrastructure/sync/syncClient";
import { openAccessGrant } from "@/sync/accessGrant";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";
import { deviceFingerprint } from "@/sync/deviceIdentity";
import { approveDevice, claimVaultAccess, revokeDevice } from "@/sync/deviceLink";
import {
  createClient,
  createVaultSecrets,
  SYNC_CONFIG,
  VAULT_ID,
  type TestClient,
} from "./support/client";
import { createRelay, type TestRelay } from "./support/relay";
import { resetTestDatabases } from "./support/sqlite";

jest.setTimeout(30_000);

let relay: TestRelay;
let founder: TestClient;
let joiner: TestClient;

const bytes = (value: Uint8Array) => Buffer.from(value);

beforeEach(async () => {
  resetTestDatabases();
  relay = await createRelay(VAULT_ID);
  global.fetch = relay.fetch;

  const secrets = await createVaultSecrets();
  founder = await createClient({ deviceId: "device-founder", secrets });
  // The joining device starts with keys of its own and no vault secrets at all.
  joiner = await createClient({
    deviceId: "device-joiner",
    secrets: {
      vaultRootKey: new Uint8Array(32),
      contentKey: new Uint8Array(32),
      locatorKey: new Uint8Array(32),
    },
  });

  await enrollDevice(SYNC_CONFIG, {
    vaultId: VAULT_ID,
    deviceId: founder.deviceId,
    repository: founder.repository,
  });
});

async function enrollJoiner() {
  return enrollDevice(SYNC_CONFIG, {
    vaultId: VAULT_ID,
    deviceId: joiner.deviceId,
    repository: joiner.repository,
  });
}

async function remoteJoiner() {
  const devices = await listDevices(SYNC_CONFIG, VAULT_ID);
  const device = devices.find((entry) => entry.deviceId === joiner.deviceId);
  if (!device) throw new Error("The joining device is missing from the roster");
  return device;
}

describe("joining a vault from a second device", () => {
  it("enrols as pending and cannot sync until a trusted device approves", async () => {
    expect(await enrollJoiner()).toBe("pending");

    const blocked = await joiner.sync();
    expect(blocked.error).toContain("403");

    expect(await claimVaultAccess(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      deviceId: joiner.deviceId,
      agreementKeys: joiner.repository.agreementKeys(),
    })).toBeNull();
  });

  it("hands over the vault keys sealed to the joining device, and nothing else", async () => {
    await enrollJoiner();
    await approveDevice(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      repository: founder.repository,
      target: await remoteJoiner(),
    });

    const claimed = await claimVaultAccess(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      deviceId: joiner.deviceId,
      agreementKeys: joiner.repository.agreementKeys(),
    });

    expect(claimed).not.toBeNull();
    expect(bytes(claimed!.secrets.vaultRootKey)).toEqual(bytes(founder.keys.vaultRootKey));
    expect(bytes(claimed!.secrets.contentKey)).toEqual(bytes(founder.keys.contentKey));
    expect(bytes(claimed!.secrets.locatorKey)).toEqual(bytes(founder.keys.locatorKey));
    expect(claimed!.approvedBy.deviceId).toBe(founder.deviceId);
  });

  it("keeps the grant opaque to the relay and to any other device", async () => {
    await enrollJoiner();
    await approveDevice(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      repository: founder.repository,
      target: await remoteJoiner(),
    });

    const stored = relay.devices.get(joiner.deviceId)!.grant!;
    for (const secret of [founder.keys.vaultRootKey, founder.keys.contentKey, founder.keys.locatorKey]) {
      expect(bytes(stored).includes(bytes(secret))).toBe(false);
    }

    // A third device holding its own keys cannot open a grant sealed elsewhere.
    const outsider = await createClient({
      deviceId: "device-outsider",
      secrets: {
        vaultRootKey: new Uint8Array(32),
        contentKey: new Uint8Array(32),
        locatorKey: new Uint8Array(32),
      },
    });
    expect(() =>
      openAccessGrant(vaultCryptoProvider, stored, {
        vaultId: VAULT_ID,
        recipientDeviceId: joiner.deviceId,
        authorizingSigningPublicKey: founder.repository.deviceIdentity().signingPublicKey,
        recipientAgreementKeys: outsider.repository.agreementKeys(),
      }),
    ).toThrow();
  });

  it("refuses a grant that was not signed by the device it claims", async () => {
    await enrollJoiner();
    await approveDevice(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      repository: founder.repository,
      target: await remoteJoiner(),
    });

    const stored = relay.devices.get(joiner.deviceId)!.grant!;
    expect(() =>
      openAccessGrant(vaultCryptoProvider, stored, {
        vaultId: VAULT_ID,
        recipientDeviceId: joiner.deviceId,
        authorizingSigningPublicKey: joiner.repository.deviceIdentity().signingPublicKey,
        recipientAgreementKeys: joiner.repository.agreementKeys(),
      }),
    ).toThrow(/signature is invalid/);
  });

  it("syncs once approved and stops again once revoked", async () => {
    await founder.repository.createPage({ title: "Before the join" });
    await founder.sync();

    await enrollJoiner();
    await approveDevice(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      repository: founder.repository,
      target: await remoteJoiner(),
    });

    // The joining device adopts the vault secrets it just unwrapped.
    const claimed = await claimVaultAccess(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      deviceId: joiner.deviceId,
      agreementKeys: joiner.repository.agreementKeys(),
    });
    Object.assign(joiner.keys, claimed!.secrets);

    const joined = await joiner.sync();
    expect(joined.error).toBeNull();
    expect((await joiner.repository.snapshot()).pages.map((page) => page.title)).toEqual([
      "Before the join",
    ]);

    await revokeDevice(SYNC_CONFIG, {
      vaultId: VAULT_ID,
      repository: founder.repository,
      target: await remoteJoiner(),
    });

    await founder.repository.createPage({ title: "After the revocation" });
    await founder.sync();

    const blocked = await joiner.sync();
    expect(blocked.error).toContain("403");
    expect((await joiner.repository.snapshot()).pages.map((page) => page.title)).toEqual([
      "Before the join",
    ]);
  });
});

describe("out-of-band verification", () => {
  it("shows the same fingerprint on both screens and a different one per device", async () => {
    await enrollJoiner();

    const onJoiner = deviceFingerprint(vaultCryptoProvider, joiner.repository.deviceIdentity());
    const onFounder = deviceFingerprint(vaultCryptoProvider, await remoteJoiner());
    expect(onFounder).toBe(onJoiner);
    expect(onJoiner).toMatch(/^\d{5}-\d{5}-\d{5}-\d{5}$/);

    expect(deviceFingerprint(vaultCryptoProvider, founder.repository.deviceIdentity())).not.toBe(
      onJoiner,
    );
  });

  it("changes when either published key is substituted", async () => {
    await enrollJoiner();
    const genuine = await remoteJoiner();
    const substituted = { ...genuine, agreementPublicKey: founder.repository.deviceIdentity().agreementPublicKey };

    expect(deviceFingerprint(vaultCryptoProvider, substituted)).not.toBe(
      deviceFingerprint(vaultCryptoProvider, genuine),
    );
  });
});
