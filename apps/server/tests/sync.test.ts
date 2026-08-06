import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeSignedSyncRecord, encodeSignedSyncRecord, zeroRecordHash } from "@giraffle/protocol";
import {
  buildChain,
  buildRecord,
  createHarness,
  encode,
  enroll,
  pull,
  push,
  type TestHarness,
} from "./helpers.ts";

let harness: TestHarness;

beforeEach(async () => {
  harness = await createHarness();
  const response = await enroll(harness);
  expect(response.status).toBe(201);
});

afterEach(() => {
  harness.store.close();
});

function recordIdsOf(records: { encodedRecord: string }[]) {
  return records.map(
    (record) => decodeSignedSyncRecord(Buffer.from(record.encodedRecord, "base64url")).recordId,
  );
}

describe("push and pull", () => {
  it("stores a valid record and returns it on pull", async () => {
    const [record] = buildChain(harness, 1);

    const pushed = await push(harness, [record!]);
    expect(pushed.status).toBe(200);
    expect(await pushed.json()).toEqual({ accepted: ["record-1"] });

    const pulled = await pull(harness);
    expect(pulled.status).toBe(200);

    const body = (await pulled.json()) as {
      records: { serverSeq: string; encodedRecord: string }[];
      nextCursor: string;
      hasMore: boolean;
    };

    expect(body.records).toHaveLength(1);
    expect(body.records[0]!.serverSeq).toBe("1");
    expect(body.records[0]!.encodedRecord).toBe(encode(encodeSignedSyncRecord(record!)));
    expect(body.nextCursor).toBe("1");
    expect(body.hasMore).toBe(false);
  });

  it("rejects a record with a bad signature", async () => {
    const [record] = buildChain(harness, 1);
    const signature = new Uint8Array(record!.signature);
    signature[0] ^= 0xff;

    const response = await push(harness, [{ ...record!, signature }]);
    expect(response.status).toBe(409);

    const pulled = (await (await pull(harness)).json()) as { records: unknown[] };
    expect(pulled.records).toHaveLength(0);
  });

  it("rejects a record whose previousRecordHash does not chain", async () => {
    const chain = buildChain(harness, 1);
    expect((await push(harness, chain)).status).toBe(200);

    const broken = buildRecord(harness, { sequence: 2, previousRecordHash: zeroRecordHash() });
    const response = await push(harness, [broken]);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Device sequence gap or hash-chain mismatch",
    });

    const pulled = (await (await pull(harness)).json()) as { records: unknown[] };
    expect(pulled.records).toHaveLength(1);
  });

  it("rejects a sequence gap even when the hash chain is continuous", async () => {
    const chain = buildChain(harness, 3);
    const response = await push(harness, [chain[0]!, chain[2]!]);

    expect(response.status).toBe(409);

    // The whole batch rolls back, so the accepted first record is absent too.
    const pulled = (await (await pull(harness)).json()) as { records: unknown[] };
    expect(pulled.records).toHaveLength(0);
  });

  it("treats a replayed record id as idempotent instead of double-storing it", async () => {
    const chain = buildChain(harness, 1);

    const first = await push(harness, chain);
    expect(await first.json()).toEqual({ accepted: ["record-1"] });

    const replay = await push(harness, chain);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ accepted: ["record-1"] });

    const pulled = (await (await pull(harness)).json()) as {
      records: { serverSeq: string }[];
    };
    expect(pulled.records).toHaveLength(1);
    expect(pulled.records[0]!.serverSeq).toBe("1");
  });

  it("rejects a record id replayed with different bytes", async () => {
    const chain = buildChain(harness, 1);
    expect((await push(harness, chain)).status).toBe(200);

    const collision = buildRecord(harness, {
      sequence: 1,
      recordId: "record-1",
      previousRecordHash: zeroRecordHash(),
    });
    // A different nonce yields different ciphertext under the same record id.
    const forged = {
      ...collision,
      envelope: { ...collision.envelope, nonce: new Uint8Array(24).fill(200) },
    };

    const response = await push(harness, [forged]);
    expect(response.status).toBe(409);
  });

  it("rejects a record addressed to a different vault", async () => {
    const foreign = buildRecord(harness, { sequence: 1, vaultId: "vault-secondary" });
    const response = await push(harness, [foreign]);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Record vault does not match route" });
  });

  it("rejects a record from a device that was never enrolled", async () => {
    const stranger = buildRecord(harness, { sequence: 1, deviceId: "device-unknown" });
    const response = await push(harness, [stranger]);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Record device is not active" });
  });

  it("rejects a batch outside the 1 to 100 record bounds", async () => {
    const response = await push(harness, []);
    expect(response.status).toBe(400);
  });
});

describe("pull pagination", () => {
  it("pages deterministically without skipping or duplicating a record", async () => {
    const chain = buildChain(harness, 10);
    expect((await push(harness, chain)).status).toBe(200);

    const seen: string[] = [];
    let cursor = "0";
    let hasMore = true;
    let pages = 0;

    while (hasMore) {
      const response = await pull(harness, `?after=${cursor}&limit=3`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        records: { serverSeq: string; encodedRecord: string }[];
        nextCursor: string;
        hasMore: boolean;
      };

      seen.push(...recordIdsOf(body.records));
      expect(body.nextCursor).toBe(body.records.at(-1)?.serverSeq ?? cursor);
      cursor = body.nextCursor;
      hasMore = body.hasMore;
      pages += 1;
      expect(pages).toBeLessThan(10);
    }

    expect(seen).toEqual(chain.map((record) => record.recordId));
    expect(new Set(seen).size).toBe(10);
  });

  it("returns an empty page and a stable cursor once the client is caught up", async () => {
    const chain = buildChain(harness, 2);
    expect((await push(harness, chain)).status).toBe(200);

    const response = await pull(harness, "?after=2");
    const body = (await response.json()) as {
      records: unknown[];
      nextCursor: string;
      hasMore: boolean;
    };

    expect(body.records).toHaveLength(0);
    expect(body.nextCursor).toBe("2");
    expect(body.hasMore).toBe(false);
  });

  it("rejects a malformed cursor or limit", async () => {
    expect((await pull(harness, "?after=-1")).status).toBe(400);
    expect((await pull(harness, "?after=abc")).status).toBe(400);
    expect((await pull(harness, "?limit=0")).status).toBe(400);
    expect((await pull(harness, "?limit=101")).status).toBe(400);
  });
});
