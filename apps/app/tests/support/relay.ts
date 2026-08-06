import { createSodiumCryptoProvider } from "@giraffle/protocol/src/sodium-provider";
import {
  decodeCanonical,
  type E2eeCryptoProvider,
} from "@giraffle/protocol";

const DEVICE_HEADER = "x-giraffle-device-id";

interface RelayDevice {
  deviceId: string;
  name: string;
  status: "pending" | "active" | "revoked";
  signingPublicKey: Uint8Array;
  agreementPublicKey: Uint8Array;
  grant: Uint8Array | null;
  approvedByDeviceId: string | null;
}

const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const decode = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * An in-process stand-in for `apps/server` that speaks the same HTTP contract.
 * The relay's own rules are proven by its Vitest suite; this exists so the
 * client's pull loop, push receipts and signed authorization statements run
 * against something that answers exactly like the real thing.
 */
export interface TestRelay {
  fetch: typeof fetch;
  records: { serverSeq: number; encodedRecord: Uint8Array }[];
  devices: Map<string, RelayDevice>;
  requests: { method: string; path: string; query: string }[];
  fail(times: number, message?: string): void;
}

export async function createRelay(vaultId: string): Promise<TestRelay> {
  const crypto: E2eeCryptoProvider = await createSodiumCryptoProvider();
  const records: TestRelay["records"] = [];
  const devices = new Map<string, RelayDevice>();
  const seen = new Set<string>();
  const requests: TestRelay["requests"] = [];
  let failures = 0;
  let failureMessage = "Network request failed";

  const caller = (request: Request) => {
    const deviceId = request.headers.get(DEVICE_HEADER);
    if (!deviceId) return { error: json({ error: "Device header required" }, 400) };
    const device = devices.get(deviceId);
    if (!device || device.status !== "active") {
      return { error: json({ error: "This device is not authorized to sync this vault" }, 403) };
    }
    return { device };
  };

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (failures > 0) {
      failures -= 1;
      throw new Error(failureMessage);
    }

    const request = new Request(input as RequestInfo, init);
    const url = new URL(request.url);
    requests.push({ method: request.method, path: url.pathname, query: url.search });

    const base = `/api/v1/vaults/${encodeURIComponent(vaultId)}`;
    const route = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null;
    if (route === null) return json({ error: "Vault not found" }, 404);

    if (route === "/devices" && request.method === "POST") {
      const body = (await request.json()) as Record<string, string>;
      const existing = devices.get(body.deviceId!);
      if (existing) return json({ deviceId: existing.deviceId, status: existing.status });

      const status = devices.size === 0 ? "active" : "pending";
      devices.set(body.deviceId!, {
        deviceId: body.deviceId!,
        name: body.name!,
        status,
        signingPublicKey: decode(body.signingPublicKey!),
        agreementPublicKey: decode(body.agreementPublicKey!),
        grant: null,
        approvedByDeviceId: null,
      });
      return json({ deviceId: body.deviceId, status }, status === "active" ? 201 : 202);
    }

    if (route === "/devices" && request.method === "GET") {
      return json({
        devices: [...devices.values()].map((device) => ({
          deviceId: device.deviceId,
          name: device.name,
          status: device.status,
          signingPublicKey: encode(device.signingPublicKey),
          agreementPublicKey: encode(device.agreementPublicKey),
          enrolledAt: 1,
          approvedByDeviceId: device.approvedByDeviceId,
        })),
      });
    }

    const authorization = /^\/devices\/([^/]+)\/authorization$/.exec(route);
    if (authorization && request.method === "POST") {
      const body = (await request.json()) as Record<string, string>;
      const statement = decode(body.statement!);
      const claim = decodeCanonical(statement) as unknown as Record<string, unknown>;
      const acting = devices.get(String(claim.actingDeviceId));
      const subject = devices.get(String(claim.subjectDeviceId));

      if (!acting || acting.status !== "active") {
        return json({ error: "Only a trusted device can authorize another" }, 403);
      }
      if (!crypto.verify(statement, decode(body.signature!), acting.signingPublicKey)) {
        return json({ error: "Authorization signature verification failed" }, 403);
      }
      if (!subject || subject.deviceId !== authorization[1]) {
        return json({ error: "Device not found" }, 404);
      }

      if (claim.action === "approve") {
        subject.status = "active";
        subject.grant = decode(body.grant!);
        subject.approvedByDeviceId = acting.deviceId;
      } else {
        subject.status = "revoked";
        subject.grant = null;
      }
      return json({ deviceId: subject.deviceId, status: subject.status });
    }

    const grant = /^\/devices\/([^/]+)\/grant$/.exec(route);
    if (grant && request.method === "GET") {
      const device = devices.get(grant[1]!);
      if (!device) return json({ error: "Device not found" }, 404);
      return json({
        deviceId: device.deviceId,
        status: device.status,
        grant: device.grant ? encode(device.grant) : null,
        approvedByDeviceId: device.approvedByDeviceId,
      });
    }

    if (route === "/sync/push" && request.method === "POST") {
      const gate = caller(request);
      if (gate.error) return gate.error;

      const body = (await request.json()) as { records: string[] };
      const accepted: string[] = [];
      for (const encoded of body.records) {
        const bytes = decode(encoded);
        const recordId = String(
          (decodeCanonical(bytes) as unknown as Record<string, unknown>).recordId,
        );
        if (!seen.has(recordId)) {
          seen.add(recordId);
          records.push({ serverSeq: records.length + 1, encodedRecord: bytes });
        }
        accepted.push(recordId);
      }
      return json({ accepted });
    }

    if (route === "/sync/pull" && request.method === "GET") {
      const gate = caller(request);
      if (gate.error) return gate.error;

      const after = Number(url.searchParams.get("after") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const page = records.filter((entry) => entry.serverSeq > after).slice(0, limit);
      return json({
        records: page.map((entry) => ({
          serverSeq: String(entry.serverSeq),
          encodedRecord: encode(entry.encodedRecord),
        })),
        nextCursor: String(page.at(-1)?.serverSeq ?? after),
        hasMore: page.length === limit,
      });
    }

    return json({ error: "Not found" }, 404);
  };

  return {
    fetch: handler as unknown as typeof fetch,
    records,
    devices,
    requests,
    fail(times, message) {
      failures = times;
      if (message) failureMessage = message;
    },
  };
}
