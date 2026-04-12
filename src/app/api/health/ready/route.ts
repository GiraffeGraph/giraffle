import { NextResponse } from "next/server";
import { getReadinessHealth } from "@/lib/health";

export async function GET() {
  const readiness = await getReadinessHealth();
  return NextResponse.json(readiness.body, { status: readiness.status });
}
