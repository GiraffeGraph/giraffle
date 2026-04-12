import { redirect } from "next/navigation";

export default async function NoteGptPage({
  searchParams,
}: PageProps<"/notegpt">) {
  const { session } = await searchParams;
  const params = new URLSearchParams();

  if (typeof session === "string") {
    params.set("session", session);
  }

  redirect(`/spotter${params.size > 0 ? `?${params.toString()}` : ""}`);
}
