"use client";

import { usePathname, useRouter } from "next/navigation";
import { GraphIcon } from "@/components/sidebar/GraphIcon";

export function RightRail() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="right-rail">
      <button
        type="button"
        className={`right-rail-btn${pathname === "/graph" ? " active" : ""}`}
        onClick={() => router.push("/graph")}
        aria-label="Bağlantı ağına git"
        title="Bağlantı ağı"
      >
        <GraphIcon size={18} />
      </button>
    </div>
  );
}
