"use client";

import { GraphView } from "@/components/graph/GraphView";
import type { UniverseGraphSeed } from "../universe.types";

export function GraphUniverseModule({ seed }: { seed: UniverseGraphSeed }) {
  return (
    <GraphView graph={seed.graph} unresolvedLinks={seed.unresolvedLinks} />
  );
}
