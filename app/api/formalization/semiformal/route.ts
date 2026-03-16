import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";

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
  const body = await request.json();

  // Support both the new ArtifactGenerationRequest shape and the legacy { text } shape
  const sourceText: string = body.sourceText ?? body.text ?? "";
  const context: string = body.context ?? "";

  if (!sourceText) {
    return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
  }

  // Build user content: include context distinctly if provided
  const parts: string[] = [];
  if (context) {
    parts.push(`[Context]\n${context}`);
  }
  if ((body as ArtifactGenerationRequest).nodeId && (body as ArtifactGenerationRequest).nodeLabel) {
    parts.push(`[Node: ${(body as ArtifactGenerationRequest).nodeLabel}]`);
  }
  parts.push(sourceText);
  if ((body as ArtifactGenerationRequest).previousAttempt) {
    parts.push(`[Previous Attempt — refine this]\n${(body as ArtifactGenerationRequest).previousAttempt}`);
  }
  if ((body as ArtifactGenerationRequest).instruction) {
    parts.push(`[Additional Instruction]\n${(body as ArtifactGenerationRequest).instruction}`);
  }
  const userContent = parts.join("\n\n");

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: "formalization/semiformal",
      systemPrompt: SYSTEM_PROMPT,
      userContent,
      maxTokens: 16384,
      openRouterModel: OPENROUTER_MODEL,
    });

    const proof = usage.provider === "mock" ? mockResponse(sourceText) : responseText;
    return NextResponse.json({ proof });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[formalization/semiformal] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
