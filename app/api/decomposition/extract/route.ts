import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { removeCachedResult } from "@/app/lib/llm/cache";

const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";

const SYSTEM_PROMPT = `You are a mathematical paper analyzer. Given the text of a mathematical paper or proof document, extract all formal propositions (definitions, lemmas, theorems, propositions, corollaries, axioms) and their dependency relationships.

Return a JSON array of propositions. Each proposition has:
- "id": a unique identifier like "def-1", "lemma-2.1", "thm-3"
- "label": the label as it appears in the paper, e.g. "Definition 2.1", "Theorem 3"
- "kind": one of "definition", "lemma", "theorem", "proposition", "corollary", "axiom"
- "statement": the full statement text
- "proofText": the proof text if present, or empty string if none
- "dependsOn": array of IDs this proposition directly depends on (references, uses)

Important:
- Only include direct dependencies, not transitive ones
- IDs must be consistent across the dependsOn references
- Extract ALL formal statements, even if unnumbered
- Return ONLY the JSON array, no commentary or markdown fences`;

function mockResponse(text: string) {
  const snippet = text.slice(0, 80).replace(/\n/g, " ");
  return [
    {
      id: "def-1",
      label: "Definition 1",
      kind: "definition",
      statement: `Mock definition extracted from: "${snippet}..."`,
      proofText: "",
      dependsOn: [],
    },
    {
      id: "lemma-1",
      label: "Lemma 1",
      kind: "lemma",
      statement: "Mock lemma that depends on Definition 1",
      proofText: "Mock proof using Definition 1.",
      dependsOn: ["def-1"],
    },
    {
      id: "thm-1",
      label: "Theorem 1",
      kind: "theorem",
      statement: "Mock theorem that depends on Lemma 1",
      proofText: "Mock proof using Lemma 1.",
      dependsOn: ["lemma-1"],
    },
  ];
}

/** Strip markdown code fences if present */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?[\r\n]([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const { text: responseText, usage, cacheKey } = await callLlm({
      endpoint: "decomposition/extract",
      systemPrompt: SYSTEM_PROMPT,
      userContent: text,
      maxTokens: 16384,
      openRouterModel: OPENROUTER_MODEL,
    });

    if (usage.provider === "mock") {
      return NextResponse.json({ propositions: mockResponse(text) });
    }

    try {
      const propositions = JSON.parse(extractJson(responseText));
      return NextResponse.json({ propositions });
    } catch {
      // JSON parse failed — invalidate the cached bad response
      if (cacheKey) {
        try { removeCachedResult(cacheKey.model, cacheKey.systemPrompt, cacheKey.userContent, cacheKey.maxTokens); } catch { /* ignore */ }
      }
      const preview = responseText.slice(0, 500);
      console.error("[decomposition/extract] Failed to parse LLM response as JSON:", preview);
      return NextResponse.json(
        { error: "LLM response was not valid JSON", details: preview },
        { status: 502 },
      );
    }
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[decomposition/extract] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
