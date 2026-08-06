import type { VaultRepository } from "@/infrastructure/database/repository";
import {
  authorizeDevice,
  fetchDeviceGrant,
  listDevices,
  type RemoteDevice,
  type SyncConfiguration,
} from "@/infrastructure/sync/syncClient";
import { createId } from "@/platform/ids";
import { createAccessGrant, openAccessGrant, type VaultSecrets } from "./accessGrant";
import { nativeCryptoProvider } from "./cryptoProvider";
import { deviceFingerprint, signAuthorizationStatement } from "./deviceIdentity";

export interface LinkableDevice extends RemoteDevice {
  fingerprint: string;
  isThisDevice: boolean;
}

export class DeviceLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceLinkError";
  }
}

/** The roster a human compares against the other screen, fingerprints included. */
export async function loadLinkableDevices(
  config: SyncConfiguration,
  input: { vaultId: string; deviceId: string },
): Promise<LinkableDevice[]> {
  const devices = await listDevices(config, input.vaultId);
  return devices.map((device) => ({
    ...device,
    fingerprint: deviceFingerprint(nativeCryptoProvider, device),
    isThisDevice: device.deviceId === input.deviceId,
  }));
}

/**
 * Seals this vault's keys to the waiting device and signs a statement naming
 * exactly the public keys that were on screen when the human approved. The relay
 * stores the sealed blob and can neither open it nor forge the statement.
 */
export async function approveDevice(
  config: SyncConfiguration,
  input: { vaultId: string; repository: VaultRepository; target: RemoteDevice },
): Promise<void> {
  if (input.target.status !== "pending") {
    throw new DeviceLinkError("That device is not waiting for approval");
  }

  const identity = input.repository.deviceIdentity();
  const secrets: VaultSecrets = input.repository.vaultSecrets();
  const grant = createAccessGrant(nativeCryptoProvider, {
    wrapperId: createId(),
    vaultId: input.vaultId,
    recipientDeviceId: input.target.deviceId,
    recipientAgreementPublicKey: input.target.agreementPublicKey,
    authorizingDeviceId: identity.deviceId,
    authorizingSigningPrivateKey: input.repository.signingPrivateKey(),
    issuedAt: { physicalMs: Date.now(), logical: 0 },
    secrets,
  });

  const signed = signAuthorizationStatement(nativeCryptoProvider, {
    action: "approve",
    vaultId: input.vaultId,
    actingDeviceId: identity.deviceId,
    actingSigningPrivateKey: input.repository.signingPrivateKey(),
    subject: input.target,
    grant,
  });

  await authorizeDevice(config, {
    vaultId: input.vaultId,
    subjectDeviceId: input.target.deviceId,
    statement: signed.statement,
    signature: signed.signature,
    grant,
  });
}

export async function revokeDevice(
  config: SyncConfiguration,
  input: { vaultId: string; repository: VaultRepository; target: RemoteDevice },
): Promise<void> {
  const identity = input.repository.deviceIdentity();
  if (identity.deviceId === input.target.deviceId) {
    throw new DeviceLinkError("A device cannot revoke itself");
  }

  const signed = signAuthorizationStatement(nativeCryptoProvider, {
    action: "revoke",
    vaultId: input.vaultId,
    actingDeviceId: identity.deviceId,
    actingSigningPrivateKey: input.repository.signingPrivateKey(),
    subject: input.target,
  });

  await authorizeDevice(config, {
    vaultId: input.vaultId,
    subjectDeviceId: input.target.deviceId,
    statement: signed.statement,
    signature: signed.signature,
  });
}

export interface ClaimedVaultAccess {
  secrets: VaultSecrets;
  approvedBy: { deviceId: string; fingerprint: string };
}

/**
 * The waiting device's side. `null` means approval has not happened yet, which
 * is the normal answer while the human is still comparing fingerprints.
 */
export async function claimVaultAccess(
  config: SyncConfiguration,
  input: {
    vaultId: string;
    deviceId: string;
    agreementKeys: { publicKey: Uint8Array; privateKey: Uint8Array };
  },
): Promise<ClaimedVaultAccess | null> {
  const pending = await fetchDeviceGrant(config, input);
  if (pending.status === "revoked") {
    throw new DeviceLinkError("This device was removed from the vault");
  }
  if (!pending.grant || !pending.approvedByDeviceId) return null;

  const approver = (await listDevices(config, input.vaultId)).find(
    (device) => device.deviceId === pending.approvedByDeviceId,
  );
  if (!approver) {
    throw new DeviceLinkError("The approving device is no longer listed");
  }

  const opened = openAccessGrant(nativeCryptoProvider, pending.grant, {
    vaultId: input.vaultId,
    recipientDeviceId: input.deviceId,
    authorizingSigningPublicKey: approver.signingPublicKey,
    recipientAgreementKeys: input.agreementKeys,
  });

  return {
    secrets: {
      vaultRootKey: opened.vaultRootKey,
      contentKey: opened.contentKey,
      locatorKey: opened.locatorKey,
    },
    // Shown so the human can confirm the key that signed the grant is the one
    // that was on the trusted device's screen.
    approvedBy: {
      deviceId: approver.deviceId,
      fingerprint: deviceFingerprint(nativeCryptoProvider, approver),
    },
  };
}
