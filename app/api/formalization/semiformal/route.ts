import { NextRequest } from "next/server";
import { handleArtifactRoute } from "@/app/lib/formalization/artifactRoute";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";

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
  return handleArtifactRoute(request, {
    endpoint: "formalization/semiformal",
    systemPrompt: SYSTEM_PROMPT,
    responseKey: "proof",
    mockResponse,
    maxTokens: 16384,
    parseResponse: "text",
    // Support the legacy { text } shape alongside ArtifactGenerationRequest
    transformBody: (raw) => ({
      sourceText: (raw.sourceText as string) ?? (raw.text as string) ?? "",
      context: (raw.context as string) ?? "",
      nodeId: raw.nodeId as string | undefined,
      nodeLabel: raw.nodeLabel as string | undefined,
      previousAttempt: raw.previousAttempt as string | undefined,
      instruction: raw.instruction as string | undefined,
    } satisfies ArtifactGenerationRequest),
  });
}
