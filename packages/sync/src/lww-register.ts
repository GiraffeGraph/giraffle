import {
  compareVersionStamps,
  type VersionStamp,
} from "@giraffle/protocol";

export interface LwwRegister<T> {
  value: T;
  stamp: VersionStamp;
}

export interface ObjectPresence {
  deleted: boolean;
}

export interface TreeParentValue {
  parentId: string | null;
}

export interface TreeParentAssignment extends LwwRegister<TreeParentValue> {
  nodeId: string;
}

export function mergeLwwRegister<T>(
  current: LwwRegister<T> | undefined,
  candidate: LwwRegister<T>,
) {
  if (!current || compareVersionStamps(candidate.stamp, current.stamp) > 0) {
    return candidate;
  }
  return current;
}

export function isObjectVisible(
  presence: LwwRegister<ObjectPresence> | undefined,
) {
  return !presence?.value.deleted;
}

function compareCodeUnits(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function findCycle(parents: Map<string, string | null>) {
  const globallyVisited = new Set<string>();

  for (const start of [...parents.keys()].sort(compareCodeUnits)) {
    if (globallyVisited.has(start)) {
      continue;
    }

    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let current: string | null = start;

    while (current !== null && parents.has(current)) {
      const cycleStart = pathIndexes.get(current);
      if (cycleStart !== undefined) {
        return path.slice(cycleStart);
      }
      if (globallyVisited.has(current)) {
        break;
      }

      pathIndexes.set(current, path.length);
      path.push(current);
      current = parents.get(current) ?? null;
    }

    for (const nodeId of path) {
      globallyVisited.add(nodeId);
    }
  }

  return null;
}

/**
 * Resolves one winning parent register per visible node, then deterministically
 * detaches the oldest edge in each cycle. Missing/deleted/self parents become
 * root assignments. Inputs are not mutated.
 */
export function resolveTreeParentAssignments(
  assignments: readonly TreeParentAssignment[],
  visibleNodeIds: ReadonlySet<string>,
) {
  const winners = new Map<string, TreeParentAssignment>();
  for (const assignment of assignments) {
    if (!visibleNodeIds.has(assignment.nodeId)) {
      continue;
    }
    const current = winners.get(assignment.nodeId);
    if (
      !current ||
      compareVersionStamps(assignment.stamp, current.stamp) > 0
    ) {
      winners.set(assignment.nodeId, assignment);
    }
  }

  const parents = new Map<string, string | null>();
  for (const nodeId of [...visibleNodeIds].sort(compareCodeUnits)) {
    const parentId = winners.get(nodeId)?.value.parentId ?? null;
    parents.set(
      nodeId,
      parentId === nodeId || (parentId !== null && !visibleNodeIds.has(parentId))
        ? null
        : parentId,
    );
  }

  let cycle = findCycle(parents);
  while (cycle) {
    const detach = cycle.reduce((oldest, nodeId) => {
      const candidate = winners.get(nodeId);
      const current = winners.get(oldest);
      if (!candidate) {
        return nodeId;
      }
      if (!current) {
        return oldest;
      }

      const order = compareVersionStamps(candidate.stamp, current.stamp);
      if (order < 0) {
        return nodeId;
      }
      if (order > 0) {
        return oldest;
      }
      return compareCodeUnits(nodeId, oldest) < 0 ? nodeId : oldest;
    });
    parents.set(detach, null);
    cycle = findCycle(parents);
  }

  return parents;
}
