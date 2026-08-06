import { Hono } from "hono";
import { decodeBoundedBase64 } from "../encoding.ts";
import type { Store } from "../storage/queries.ts";
import type { AppEnv } from "./auth.ts";

const DEVICE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const PUBLIC_KEY_BYTES = 32;

interface EnrollmentBody {
  deviceId?: unknown;
  name?: unknown;
  signingPublicKey?: unknown;
  agreementPublicKey?: unknown;
  protocolVersion?: unknown;
}

export function devicesRoutes(store: Store) {
  const routes = new Hono<AppEnv>();

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

    const existingDevices = auth.vault ? store.countActiveDevices(auth.vaultId) : 0;
    if (existingDevices > 0) {
      // Only the enrolled device may replay its own enrollment; adding a second
      // device needs an existing device to authorize it out of band.
      const existing = store.findDevice(body.deviceId);
      if (
        !existing ||
        existing.vaultId !== auth.vaultId ||
        !Buffer.from(existing.signingPublicKey).equals(signingPublicKey)
      ) {
        return c.json({ error: "A trusted device must authorize additional enrollment" }, 409);
      }
      return c.json({ deviceId: existing.id, status: existing.status });
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

  return routes;
}
