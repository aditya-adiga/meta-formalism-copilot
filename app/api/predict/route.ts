import { NextResponse } from "next/server";
import { predictCall } from "@/app/lib/llm/predict";

export async function POST(request: Request) {
  const body = await request.json();
  const { endpoint, userContentLength } = body;

  if (typeof endpoint !== "string" || typeof userContentLength !== "number") {
    return NextResponse.json(
      { error: "Expected { endpoint: string, userContentLength: number }" },
      { status: 400 },
    );
  }

  const prediction = predictCall(endpoint, userContentLength);
  return NextResponse.json(prediction);
}
