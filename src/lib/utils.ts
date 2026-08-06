import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
