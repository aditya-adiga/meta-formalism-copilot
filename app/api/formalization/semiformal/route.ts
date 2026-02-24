import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
// const OPENROUTER_MODEL = "deepseek/deepseek-prover-v2";
// const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = "You are a mathematical reasoning assistant. The user will provide text from a conversation or document. Generate semiformal mathematical reasoning that captures the key ideas — using mathematical notation, logical structure, and proof sketches where appropriate. Begin with a # markdown heading that names the theorem or result, then present the reasoning.";

const SEMIFORMAL_SCHEMA = {
  type: "object",
  properties: {
    proof: {
      type: "string",
      description: "Semiformal mathematical proof in markdown. Must start with a # heading naming the result.",
      pattern: "^#",
    },
  },
  required: ["proof"],
  additionalProperties: false,
};

/** Guarantee the proof starts with a markdown heading. */
function ensureMarkdownHeading(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith("#") ? trimmed : `# Theorem\n\n${trimmed}`;
}

/** Fallback for when the provider ignores response_format and returns a plain string. */
function extractProof(raw: string): string {
  return raw.trim();
}

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
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ output_config: { format: { type: "json_schema", schema: SEMIFORMAL_SCHEMA } } } as any),
    });
    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    let proof: string;
    try {
      proof = (JSON.parse(raw) as { proof?: string }).proof ?? raw;
    } catch {
      proof = extractProof(raw);
    }
    return NextResponse.json({ proof: ensureMarkdownHeading(proof) });
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
      response_format: {
        type: "json_schema",
        json_schema: { name: "semiformal_output", strict: true, schema: SEMIFORMAL_SCHEMA },
      },
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
  const raw = data.choices?.[0]?.message?.content ?? "";
  let proof: string;
  try {
    proof = (JSON.parse(raw) as { proof?: string }).proof ?? raw;
  } catch {
    proof = extractProof(raw);
  }

  return NextResponse.json({ proof: ensureMarkdownHeading(proof) });
}
