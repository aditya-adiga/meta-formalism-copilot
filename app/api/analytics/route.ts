import { NextResponse } from "next/server";
import { readAnalyticsEntries, clearAnalyticsEntries } from "@/app/lib/analytics/persist";

export async function GET() {
  const entries = readAnalyticsEntries();
  return NextResponse.json({ entries });
}

export async function DELETE() {
  clearAnalyticsEntries();
  return NextResponse.json({ ok: true });
}
