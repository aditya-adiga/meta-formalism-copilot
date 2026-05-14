import { NextRequest, NextResponse } from "next/server";

const REQUEST_TIMEOUT_MS = 35_000;

type UnavailableReason = "verifier-not-configured" | "verifier-unreachable" | "verifier-error";

function unavailableResponse(reason: UnavailableReason, detail?: string) {
  return NextResponse.json({
    valid: false,
    unavailable: true,
    reason,
    ...(detail ? { detail } : {}),
  });
}

export async function POST(request: NextRequest) {
  const { leanCode } = await request.json();

  if (!leanCode || typeof leanCode !== "string") {
    return NextResponse.json(
      { error: "leanCode is required" },
      { status: 400 },
    );
  }

  const verifierUrl = process.env.LEAN_VERIFIER_URL;
  if (!verifierUrl) {
    // No verifier configured (typical on Vercel deploys without a separate verifier service).
    return unavailableResponse("verifier-not-configured");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`${verifierUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leanCode }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // Verifier reachable but errored — treat as unavailable rather than a failed proof,
      // since the proof itself was never checked. Forward upstream body (truncated) so
      // operators can diagnose verifier-side failures.
      const body = await res.text().catch(() => "");
      const detail = body
        ? `HTTP ${res.status}: ${body.slice(0, 500)}`
        : `HTTP ${res.status}`;
      return unavailableResponse("verifier-error", detail);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    // Network / timeout / DNS failure — verifier unreachable.
    return unavailableResponse("verifier-unreachable");
  }
}
