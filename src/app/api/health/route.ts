import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      service: "giraffle",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "giraffle",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 }
    );
  }
}
