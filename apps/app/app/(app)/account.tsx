import { Redirect } from "expo-router";

/** Kept for old links; workspace management now has one canonical destination. */
export default function Account() {
  return <Redirect href="/settings" />;
}
