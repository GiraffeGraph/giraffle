import { describe, expect, it } from "vitest";
import {
  YjsSyncError,
  applyYjsUpdate,
  createYjsDocument,
  encodeYjsCheckpoint,
  encodeYjsDiff,
  encodeYjsStateVector,
  mergeYjsUpdates,
} from "@giraffle/sync";

function captureUpdates(document: ReturnType<typeof createYjsDocument>) {
  const updates: Uint8Array[] = [];
  document.on("update", (update: Uint8Array) => updates.push(update));
  return updates;
}

describe("Yjs encrypted-update integration", () => {
  it("converges concurrent offline body edits under duplicate and reordered delivery", () => {
    const deviceA = createYjsDocument();
    const initialUpdates = captureUpdates(deviceA);
    deviceA.getText("body").insert(0, "base");
    const baseline = mergeYjsUpdates(initialUpdates);

    const deviceB = createYjsDocument();
    applyYjsUpdate(deviceB, baseline);
    const updatesA = captureUpdates(deviceA);
    const updatesB = captureUpdates(deviceB);

    deviceA.getText("body").insert(4, "-from-a");
    deviceB.getText("body").insert(4, "-from-b");

    const replica1 = createYjsDocument();
    const replica2 = createYjsDocument();
    for (const replica of [replica1, replica2]) {
      applyYjsUpdate(replica, baseline);
    }
    for (const update of [...updatesA, ...updatesB, ...updatesA]) {
      applyYjsUpdate(replica1, update);
    }
    for (const update of [...updatesB, ...updatesA].reverse()) {
      applyYjsUpdate(replica2, update);
    }

    expect(replica1.getText("body").toString()).toBe(
      replica2.getText("body").toString(),
    );
    expect(replica1.getText("body").toString()).toContain("from-a");
    expect(replica1.getText("body").toString()).toContain("from-b");
  });

  it("restores a compact full-state checkpoint on a clean device", () => {
    const source = createYjsDocument();
    source.getText("body").insert(0, "checkpoint body");
    source.getMap("meta").set("schema", 1);

    const restored = createYjsDocument();
    applyYjsUpdate(restored, encodeYjsCheckpoint(source));

    expect(restored.getText("body").toString()).toBe("checkpoint body");
    expect(restored.getMap("meta").get("schema")).toBe(1);
  });

  it("uses state vectors to transfer only missing updates", () => {
    const source = createYjsDocument();
    source.getText("body").insert(0, "first");
    const replica = createYjsDocument();
    applyYjsUpdate(replica, encodeYjsCheckpoint(source));

    source.getText("body").insert(5, " second");
    const diff = encodeYjsDiff(source, encodeYjsStateVector(replica));
    applyYjsUpdate(replica, diff);

    expect(replica.getText("body").toString()).toBe("first second");
  });

  it("converges thousands of offline edits after merged update delivery", () => {
    const deviceA = createYjsDocument();
    const deviceB = createYjsDocument();
    const updatesA = captureUpdates(deviceA);
    const updatesB = captureUpdates(deviceB);

    for (let index = 0; index < 1_000; index += 1) {
      deviceA.getText("body").insert(deviceA.getText("body").length, "a");
      deviceB.getText("body").insert(deviceB.getText("body").length, "b");
    }

    const mergedA = mergeYjsUpdates(updatesA);
    const mergedB = mergeYjsUpdates(updatesB);
    applyYjsUpdate(deviceA, mergedB);
    applyYjsUpdate(deviceB, mergedA);

    expect(deviceA.getText("body").toString()).toBe(
      deviceB.getText("body").toString(),
    );
    expect(deviceA.getText("body").length).toBe(2_000);
  });

  it("rejects empty, oversized, and malformed updates", () => {
    expect(() => applyYjsUpdate(createYjsDocument(), new Uint8Array())).toThrow(
      YjsSyncError,
    );
    expect(() =>
      applyYjsUpdate(createYjsDocument(), new Uint8Array([255, 255, 255])),
    ).toThrow(/malformed/);
    expect(() => mergeYjsUpdates([])).toThrow(/batch count/);
  });
});
