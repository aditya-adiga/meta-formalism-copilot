import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "ai-mo/kimina-prover-72b";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const BASE_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. The user will provide an informal or semi-formal mathematical proof. Convert it into valid Lean4 code.

The verifier uses plain Lean4 (no Mathlib). Do not use \`import Mathlib\` or any external library imports.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Do not import Mathlib or any external packages; use only built-in Lean4 constructs
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by decide\`, \`by exact\`, \`by intro\`)
- Return only the Lean4 code with no additional commentary`;

const RETRY_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. Your previous attempt to formalize a proof failed verification. The user will provide the original proof, your previous attempt, and the verification errors. Fix the Lean4 code so it passes verification.

The verifier uses plain Lean4 (no Mathlib). Do not use \`import Mathlib\` or any external library imports.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Do not import Mathlib or any external packages; use only built-in Lean4 constructs
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by decide\`, \`by exact\`, \`by intro\`)
- Address all verification errors shown in the error output
- Return only the corrected Lean4 code with no additional commentary`;

function mockResponse(informalProof: string, isRetry: boolean): string {
  const snippet = informalProof.slice(0, 60).replace(/\n/g, " ");
  return `-- Mock Lean4 output (no API key configured)${isRetry ? " [RETRY]" : ""}
-- From: "${snippet}${informalProof.length > 60 ? "..." : ""}"

theorem example_formalization (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q :=
  ⟨hp, hq⟩`;
}

export async function POST(request: NextRequest) {
  const { informalProof, previousAttempt, errors } = await request.json();

  const isRetry = Boolean(previousAttempt && errors);
  const systemPrompt = isRetry ? RETRY_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;
  const userContent = isRetry
    ? `Original proof:\n${informalProof}\n\nPrevious Lean4 attempt:\n${previousAttempt}\n\nVerification errors:\n${errors}`
    : informalProof;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    const leanCode = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ leanCode });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn("[formalization/lean] No API key configured — returning mock response.\n\n To generate real responses, add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local");
    return NextResponse.json({ leanCode: mockResponse(informalProof, isRetry) });
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
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[formalization/lean] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 },
    );
  }

  const data = await response.json();
  const leanCode = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ leanCode });
}
