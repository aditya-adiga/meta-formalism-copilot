import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-prover-v2";

function mockResponse(text: string): string {
  return [
    "-- Mock formalization (no API key configured)",
    "",
    `-- Source: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
    "",
    "theorem example : ∀ (P Q : Prop), P → Q → P ∧ Q := by",
    "  intro hp hq",
    "  exact ⟨hp, hq⟩",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[formalization/informal] No OPENROUTER_API_KEY — returning mock response.\n\n To generate real responses, add your OpenRouter API key to .env.local");
    return NextResponse.json({ proof: mockResponse(text) });
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[formalization/informal] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 }
    );
  }

  const data = await response.json();
  const proof = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ proof });
}
