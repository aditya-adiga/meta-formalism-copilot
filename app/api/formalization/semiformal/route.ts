import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// const OPENROUTER_MODEL = "deepseek/deepseek-prover-v2";
const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";
// const OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = "You are a mathematical reasoning assistant. The user will provide text from a conversation or document. Generate semiformal mathematical reasoning that captures the key ideas — using mathematical notation, logical structure, and proof sketches where appropriate. Return structured output with the mathematical reasoning.";

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    const proof = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ proof });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn("[formalization/semiformal] No API key configured — returning mock response.\n\n To generate real responses, add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local");
    return NextResponse.json({ proof: mockResponse(text) });
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterKey}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[formalization/semiformal] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 }
    );
  }

  const data = await response.json();
  const proof = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ proof });
}
