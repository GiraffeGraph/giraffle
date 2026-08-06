"use client";

import { createPortal } from "react-dom";

export function BodyPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
