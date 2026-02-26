import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";

const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";

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

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: "formalization/semiformal",
      systemPrompt: SYSTEM_PROMPT,
      userContent: text,
      maxTokens: 16384,
      openRouterModel: OPENROUTER_MODEL,
    });

    const proof = usage.provider === "mock" ? mockResponse(text) : responseText;
    return NextResponse.json({ proof, _usage: { ...usage, endpoint: "formalization/semiformal", timestamp: new Date().toISOString() } });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    throw err;
  }
}
