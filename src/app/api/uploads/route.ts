import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateId, slugify } from "@/lib/utils";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ALT_TEXT_LENGTH = 500;

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const noteIdValue = formData.get("noteId");
  const altTextValue = String(formData.get("altText") ?? "").trim();
  const altText = altTextValue ? altTextValue.slice(0, MAX_ALT_TEXT_LENGTH) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only image uploads are supported" },
      { status: 400 }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Image uploads must be 10 MB or smaller" },
      { status: 400 }
    );
  }

  const noteId =
    typeof noteIdValue === "string" && noteIdValue.trim().length > 0
      ? noteIdValue.trim()
      : null;

  if (noteId) {
    const note = await db.note.findFirst({
      where: {
        id: noteId,
        userId,
      },
      select: { id: true },
    });

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = path.extname(file.name) || ".bin";
  const baseName = slugify(path.basename(file.name, extension)) || "asset";
  const now = new Date();
  const relativeDirectory = path.join(
    "uploads",
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0")
  );
  const fileName = `${generateId()}-${baseName}${extension}`;
  const publicDirectory = path.join(process.cwd(), "public", relativeDirectory);
  const absolutePath = path.join(publicDirectory, fileName);

  await mkdir(publicDirectory, { recursive: true });
  await writeFile(absolutePath, bytes);

  const storagePath = `/${relativeDirectory.replaceAll("\\", "/")}/${fileName}`;

  await db.mediaAsset.create({
    data: {
      userId,
      noteId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storagePath,
      altText,
    },
  });

  return NextResponse.json({
    src: storagePath,
    alt: altText,
  });
}
