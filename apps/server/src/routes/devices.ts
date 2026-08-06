import { Hono } from "hono";
import { bytesEqual } from "@giraffle/protocol";
import {
  DEVICE_STATEMENT_SKEW_MS,
  DeviceStatementError,
  decodeDeviceAuthorizationStatement,
  hashDeviceAuthorizationStatement,
  hashGrant,
  MAX_ENCODED_DEVICE_STATEMENT_BYTES,
  PUBLIC_KEY_BYTES,
  verifyDeviceAuthorizationStatement,
  zeroGrantHash,
} from "../device-statement.ts";
import { decodeBoundedBase64, encodeBase64 } from "../encoding.ts";
import { getCryptoProvider } from "../crypto.ts";
import type { DeviceRow, Store } from "../storage/queries.ts";
import type { AppEnv } from "./auth.ts";

const DEVICE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_GRANT_BYTES = 8192;

interface EnrollmentBody {
  deviceId?: unknown;
  name?: unknown;
  signingPublicKey?: unknown;
  agreementPublicKey?: unknown;
  protocolVersion?: unknown;
}

interface AuthorizationBody {
  statement?: unknown;
  signature?: unknown;
  grant?: unknown;
}

function publicDevice(device: DeviceRow) {
  return {
    deviceId: device.id,
    name: device.name,
    status: device.status,
    signingPublicKey: encodeBase64(device.signingPublicKey),
    agreementPublicKey: encodeBase64(device.agreementPublicKey),
    enrolledAt: device.authorizedAt,
    approvedAt: device.approvedAt,
    approvedByDeviceId: device.approvedByDeviceId,
    revokedAt: device.revokedAt,
  };
}

export function devicesRoutes(store: Store) {
  const routes = new Hono<AppEnv>();

  /** Public keys and status only; the roster carries nothing the relay could read. */
  routes.get("/", (c) => {
    const auth = c.get("auth");
    if (!auth.vault) {
      return c.json({ error: "Vault not found" }, 404);
    }
    return c.json({ devices: store.listDevices(auth.vaultId).map(publicDevice) });
  });

  routes.post("/", async (c) => {
    const auth = c.get("auth");

    let body: EnrollmentBody;
    try {
      body = (await c.req.json()) as EnrollmentBody;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    if (
      body.protocolVersion !== 1 ||
      typeof body.deviceId !== "string" ||
      !DEVICE_ID.test(body.deviceId) ||
      typeof body.name !== "string" ||
      body.name.length < 1 ||
      body.name.length > 80
    ) {
      return c.json({ error: "Invalid device enrollment" }, 400);
    }

    let signingPublicKey: Buffer;
    let agreementPublicKey: Buffer;
    try {
      signingPublicKey = decodeBoundedBase64(body.signingPublicKey, PUBLIC_KEY_BYTES);
      agreementPublicKey = decodeBoundedBase64(body.agreementPublicKey, PUBLIC_KEY_BYTES);
    } catch {
      return c.json({ error: "Invalid device public keys" }, 400);
    }

    if (
      signingPublicKey.length !== PUBLIC_KEY_BYTES ||
      agreementPublicKey.length !== PUBLIC_KEY_BYTES
    ) {
      return c.json({ error: "Device public keys must be 32 bytes" }, 400);
    }

    // Vault existence, not the live device count, decides who bootstraps. A
    // vault whose devices were all revoked must not be adoptable by a stranger.
    if (auth.vault) {
      const existing = store.findDevice(body.deviceId);
      if (existing) {
        if (
          existing.vaultId !== auth.vaultId ||
          !bytesEqual(existing.signingPublicKey, signingPublicKey) ||
          !bytesEqual(existing.agreementPublicKey, agreementPublicKey)
        ) {
          return c.json({ error: "This device id is already enrolled with other keys" }, 409);
        }
        return c.json({ deviceId: existing.id, status: existing.status });
      }

      store.enrollPendingDevice({
        vaultId: auth.vaultId,
        deviceId: body.deviceId,
        name: body.name,
        signingPublicKey,
        agreementPublicKey,
      });
      return c.json({ deviceId: body.deviceId, status: "pending" }, 202);
    }

    store.enrollFirstDevice({
      vaultId: auth.vaultId,
      deviceId: body.deviceId,
      name: body.name,
      signingPublicKey,
      agreementPublicKey,
    });

    return c.json({ deviceId: body.deviceId, status: "active" }, 201);
  });

  /**
   * Approval and revocation share one route because the signed statement, not
   * the URL, is what the acting device committed to. Deciding from the URL would
   * let a relay turn a signed revocation into an approval.
   */
  routes.post("/:deviceId/authorization", async (c) => {
    const auth = c.get("auth");
    if (!auth.vault) {
      return c.json({ error: "Vault not found" }, 404);
    }

    let body: AuthorizationBody;
    try {
      body = (await c.req.json()) as AuthorizationBody;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    let encodedStatement: Buffer;
    let signature: Buffer;
    let grant: Buffer | null = null;
    try {
      encodedStatement = decodeBoundedBase64(body.statement, MAX_ENCODED_DEVICE_STATEMENT_BYTES);
      signature = decodeBoundedBase64(body.signature, 64);
      if (body.grant !== undefined && body.grant !== null) {
        grant = decodeBoundedBase64(body.grant, MAX_GRANT_BYTES);
      }
    } catch {
      return c.json({ error: "Invalid authorization payload" }, 400);
    }

    const crypto = await getCryptoProvider();

    let statement;
    try {
      statement = decodeDeviceAuthorizationStatement(encodedStatement);
    } catch (error) {
      return c.json(
        { error: error instanceof DeviceStatementError ? error.message : "Invalid statement" },
        400,
      );
    }

    if (
      statement.vaultId !== auth.vaultId ||
      statement.subjectDeviceId !== c.req.param("deviceId")
    ) {
      return c.json({ error: "Statement does not match this route" }, 400);
    }
    if (statement.actingDeviceId === statement.subjectDeviceId) {
      return c.json({ error: "A device cannot authorize itself" }, 403);
    }
    if (Math.abs(Date.now() - statement.issuedAtMs) > DEVICE_STATEMENT_SKEW_MS) {
      return c.json({ error: "Authorization statement is outside the accepted time window" }, 403);
    }

    const acting = store.findDevice(statement.actingDeviceId);
    if (!acting || acting.vaultId !== auth.vaultId || acting.status !== "active") {
      return c.json({ error: "Only a trusted device can authorize another" }, 403);
    }

    try {
      verifyDeviceAuthorizationStatement(
        crypto,
        encodedStatement,
        signature,
        acting.signingPublicKey,
      );
    } catch {
      return c.json({ error: "Authorization signature verification failed" }, 403);
    }

    // A statement is single-use. Checking that before any state comparison stops
    // a captured approval from being replayed to undo a later revocation.
    const statementHash = hashDeviceAuthorizationStatement(crypto, encodedStatement, signature);
    if (store.isAuthorizationSpent(statementHash)) {
      return c.json({ error: "This authorization statement was already used" }, 409);
    }

    const subject = store.findDevice(statement.subjectDeviceId);
    if (!subject || subject.vaultId !== auth.vaultId) {
      return c.json({ error: "Device not found" }, 404);
    }
    // Binding the keys into the signature is what a relay cannot forge: a
    // substituted device key makes the statement stop matching the stored row.
    if (
      !bytesEqual(subject.signingPublicKey, statement.subjectSigningPublicKey) ||
      !bytesEqual(subject.agreementPublicKey, statement.subjectAgreementPublicKey)
    ) {
      return c.json({ error: "Statement does not match the enrolled device keys" }, 409);
    }

    if (statement.action === "approve") {
      if (subject.status !== "pending") {
        return c.json({ error: `Device is already ${subject.status}` }, 409);
      }
      if (!grant) {
        return c.json({ error: "Approval must carry a sealed access grant" }, 400);
      }
      if (!bytesEqual(hashGrant(crypto, grant), statement.grantHash)) {
        return c.json({ error: "Sealed access grant does not match the signed hash" }, 409);
      }
    } else {
      if (!bytesEqual(statement.grantHash, zeroGrantHash())) {
        return c.json({ error: "A revocation must not carry a grant hash" }, 400);
      }
      if (subject.status === "revoked") {
        return c.json({ deviceId: subject.id, status: "revoked" });
      }
    }

    const applied = store.applyAuthorization({
      statementHash,
      vaultId: auth.vaultId,
      actingDeviceId: statement.actingDeviceId,
      subjectDeviceId: statement.subjectDeviceId,
      action: statement.action,
      issuedAt: statement.issuedAtMs,
      ...(grant ? { grant } : {}),
    });
    if (!applied) {
      return c.json({ error: "This authorization statement was already used" }, 409);
    }

    return c.json({
      deviceId: statement.subjectDeviceId,
      status: statement.action === "approve" ? "active" : "revoked",
    });
  });

  /**
   * The waiting device polls here. The blob is sealed to its X25519 key, so
   * handing it out under the vault's bearer token reveals nothing.
   */
  routes.get("/:deviceId/grant", (c) => {
    const auth = c.get("auth");
    if (!auth.vault) {
      return c.json({ error: "Vault not found" }, 404);
    }

    const deviceId = c.req.param("deviceId");
    const device = DEVICE_ID.test(deviceId) ? store.findDevice(deviceId) : undefined;
    if (!device || device.vaultId !== auth.vaultId) {
      return c.json({ error: "Device not found" }, 404);
    }

    const grant = store.findDeviceGrant(device.id);
    return c.json({
      deviceId: device.id,
      status: device.status,
      grant: grant ? encodeBase64(grant) : null,
      approvedByDeviceId: device.approvedByDeviceId,
    });
  });

  return routes;
}
