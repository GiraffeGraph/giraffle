"use client";

import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import type { LibraryWorkspaceSeed } from "@/components/library/library.data";

export function LibraryUniverseModule({
  seed,
}: {
  seed: LibraryWorkspaceSeed;
}) {
  return <LibraryWorkspace {...seed} />;
}
