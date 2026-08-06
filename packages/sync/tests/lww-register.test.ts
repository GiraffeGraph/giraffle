import { describe, expect, it } from "vitest";
import {
  isObjectVisible,
  mergeLwwRegister,
  resolveTreeParentAssignments,
  type LwwRegister,
  type ObjectPresence,
  type TreeParentAssignment,
} from "@giraffle/sync";
import type { VersionStamp } from "@giraffle/protocol";

function stamp(
  physicalMs: number,
  deviceId: string,
  operationId: string,
  logical = 0,
): VersionStamp {
  return {
    clock: { physicalMs, logical },
    deviceId,
    operationId,
  };
}

function parent(
  nodeId: string,
  parentId: string | null,
  version: VersionStamp,
): TreeParentAssignment {
  return { nodeId, value: { parentId }, stamp: version };
}

describe("LWW registers and tree conflict repair", () => {
  it("selects physical, logical, device, then operation order deterministically", () => {
    const current = {
      value: "A",
      stamp: stamp(100, "device-a", "op-1"),
    };
    const logicalWinner = {
      value: "B",
      stamp: stamp(100, "device-a", "op-2", 1),
    };
    const deviceWinner = {
      value: "C",
      stamp: stamp(100, "device-b", "op-1", 1),
    };

    expect(mergeLwwRegister(current, logicalWinner).value).toBe("B");
    expect(mergeLwwRegister(logicalWinner, deviceWinner).value).toBe("C");
    expect(mergeLwwRegister(deviceWinner, current).value).toBe("C");
  });

  it("uses an explicit presence register for delete and restore", () => {
    const alive: LwwRegister<ObjectPresence> = {
      value: { deleted: false },
      stamp: stamp(1, "device-a", "create"),
    };
    const deleted: LwwRegister<ObjectPresence> = {
      value: { deleted: true },
      stamp: stamp(2, "device-b", "delete"),
    };
    const restored: LwwRegister<ObjectPresence> = {
      value: { deleted: false },
      stamp: stamp(3, "device-a", "restore"),
    };

    const afterDelete = mergeLwwRegister(alive, deleted);
    expect(isObjectVisible(afterDelete)).toBe(false);
    expect(isObjectVisible(mergeLwwRegister(afterDelete, restored))).toBe(true);
  });

  it("converges concurrent moves regardless of delivery order", () => {
    const first = parent("note", "folder-a", stamp(10, "device-a", "move-a"));
    const second = parent("note", "folder-b", stamp(10, "device-b", "move-b"));
    const visible = new Set(["note", "folder-a", "folder-b"]);

    expect(resolveTreeParentAssignments([first, second], visible).get("note")).toBe(
      "folder-b",
    );
    expect(resolveTreeParentAssignments([second, first], visible).get("note")).toBe(
      "folder-b",
    );
  });

  it("detaches the oldest edge to repair concurrent move cycles", () => {
    const assignments = [
      parent("folder-a", "folder-b", stamp(10, "device-a", "move-a")),
      parent("folder-b", "folder-a", stamp(11, "device-b", "move-b")),
    ];
    const visible = new Set(["folder-a", "folder-b"]);

    const forward = resolveTreeParentAssignments(assignments, visible);
    const reversed = resolveTreeParentAssignments([...assignments].reverse(), visible);

    expect([...forward]).toEqual([
      ["folder-a", null],
      ["folder-b", "folder-a"],
    ]);
    expect([...reversed]).toEqual([...forward]);
  });

  it("orphans self, missing, and deleted-parent assignments to root", () => {
    const assignments = [
      parent("self", "self", stamp(1, "device-a", "self")),
      parent("orphan", "deleted-folder", stamp(2, "device-a", "orphan")),
    ];
    const parents = resolveTreeParentAssignments(
      assignments,
      new Set(["self", "orphan"]),
    );

    expect(parents.get("self")).toBeNull();
    expect(parents.get("orphan")).toBeNull();
  });
});
