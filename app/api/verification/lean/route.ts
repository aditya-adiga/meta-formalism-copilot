import { NextRequest, NextResponse } from "next/server";

// TODO: Replace mock with real Lean server verification.
// Real implementation should:
// 1. Write leanCode to a temp file
// 2. Call the Lean server with AbortController (10s timeout)
// 3. Parse stdout/stderr for errors
// 4. Return { valid, errors } based on Lean output

export async function POST(request: NextRequest) {
  const { leanCode } = await request.json();

  if (!leanCode || typeof leanCode !== "string") {
    return NextResponse.json(
      { error: "leanCode is required" },
      { status: 400 },
    );
  }

  // Mock: always returns valid
  // To test the retry path, change valid to false and add errors
  return NextResponse.json({ valid: true });
}
