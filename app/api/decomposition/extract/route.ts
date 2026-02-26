import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const propositions = JSON.parse(extractJson(raw));
    return NextResponse.json({ propositions });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn("[decomposition/extract] No API key configured — returning mock response.");
    return NextResponse.json({ propositions: mockResponse(text) });
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
    console.error("[decomposition/extract] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 },
    );
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const propositions = JSON.parse(extractJson(raw));
  return NextResponse.json({ propositions });
}
