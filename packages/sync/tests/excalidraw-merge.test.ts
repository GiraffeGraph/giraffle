import { describe, expect, it } from "vitest";
import {
  ExcalidrawMergeError,
  mergeExcalidrawElements,
  visibleExcalidrawElements,
  type ExcalidrawElementLike,
  type VersionedExcalidrawElement,
} from "@giraffle/sync";

function candidate(input: {
  id: string;
  version: number;
  versionNonce: number;
  deviceId: string;
  operationId: string;
  isDeleted?: boolean;
  x?: number;
}): VersionedExcalidrawElement {
  const element: ExcalidrawElementLike = {
    id: input.id,
    type: "rectangle",
    version: input.version,
    versionNonce: input.versionNonce,
    isDeleted: input.isDeleted ?? false,
    x: input.x ?? 0,
    y: 0,
  };
  return {
    element,
    stamp: {
      clock: { physicalMs: input.version, logical: 0 },
      deviceId: input.deviceId,
      operationId: input.operationId,
    },
  };
}

describe("Excalidraw element merge", () => {
  it("merges independent element edits regardless of delivery order", () => {
    const rectangle = candidate({
      id: "rectangle",
      version: 1,
      versionNonce: 20,
      deviceId: "device-a",
      operationId: "op-a",
    });
    const arrow = candidate({
      id: "arrow",
      version: 1,
      versionNonce: 30,
      deviceId: "device-b",
      operationId: "op-b",
    });

    const forward = mergeExcalidrawElements([rectangle, arrow]);
    const reversed = mergeExcalidrawElements([arrow, rectangle]);

    expect(forward.elements.map(({ element }) => element.id)).toEqual([
      "arrow",
      "rectangle",
    ]);
    expect(reversed.elements).toEqual(forward.elements);
  });

  it("uses higher version then lower versionNonce like Excalidraw collaboration", () => {
    const old = candidate({
      id: "shape",
      version: 1,
      versionNonce: 10,
      deviceId: "device-a",
      operationId: "old",
      x: 1,
    });
    const higherVersion = candidate({
      id: "shape",
      version: 2,
      versionNonce: 999,
      deviceId: "device-b",
      operationId: "new",
      x: 2,
    });
    const nonceWinner = candidate({
      id: "shape",
      version: 2,
      versionNonce: 100,
      deviceId: "device-c",
      operationId: "nonce",
      x: 3,
    });

    const result = mergeExcalidrawElements([
      old,
      higherVersion,
      nonceWinner,
    ]);
    expect(result.elements[0].element.x).toBe(3);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].loser.element.x).toBe(2);
  });

  it("retains deletion tombstones while hiding them from rendered elements", () => {
    const alive = candidate({
      id: "shape",
      version: 1,
      versionNonce: 10,
      deviceId: "device-a",
      operationId: "alive",
    });
    const deleted = candidate({
      id: "shape",
      version: 2,
      versionNonce: 20,
      deviceId: "device-a",
      operationId: "delete",
      isDeleted: true,
    });

    const merged = mergeExcalidrawElements([alive, deleted]);
    expect(merged.elements).toHaveLength(1);
    expect(merged.elements[0].element.isDeleted).toBe(true);
    expect(visibleExcalidrawElements(merged.elements)).toHaveLength(0);
  });

  it("uses signed operation order only for equal version and nonce", () => {
    const fromA = candidate({
      id: "shape",
      version: 2,
      versionNonce: 10,
      deviceId: "device-a",
      operationId: "op-a",
      x: 1,
    });
    const fromB = candidate({
      id: "shape",
      version: 2,
      versionNonce: 10,
      deviceId: "device-b",
      operationId: "op-b",
      x: 2,
    });

    expect(mergeExcalidrawElements([fromA, fromB]).elements[0].element.x).toBe(
      2,
    );
    expect(mergeExcalidrawElements([fromB, fromA]).elements[0].element.x).toBe(
      2,
    );
  });

  it("rejects divergent payloads with identical cryptographic ordering metadata", () => {
    const first = candidate({
      id: "shape",
      version: 2,
      versionNonce: 10,
      deviceId: "device-a",
      operationId: "same",
      x: 1,
    });
    const divergent = candidate({
      id: "shape",
      version: 2,
      versionNonce: 10,
      deviceId: "device-a",
      operationId: "same",
      x: 2,
    });

    expect(() => mergeExcalidrawElements([first, divergent])).toThrow(
      /divergent payloads/,
    );
  });

  it("rejects malformed element metadata", () => {
    const invalid = candidate({
      id: "shape",
      version: 1,
      versionNonce: 1,
      deviceId: "device-a",
      operationId: "op",
    });
    invalid.element.version = 0;

    expect(() => mergeExcalidrawElements([invalid])).toThrow(
      ExcalidrawMergeError,
    );
  });
});
