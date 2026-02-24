import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";
// const OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const BASE_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. The user will provide an informal or semi-formal mathematical proof. Convert it into valid Lean4 code.

The verifier uses Lean4 with Mathlib. Start every file with \`import Mathlib\`.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Start with \`import Mathlib\`
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by norm_num\`, \`by exact\`, \`by linarith\`, \`by aesop\`)
- Return only the Lean4 code with no additional commentary`;

const RETRY_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. Your previous attempt to formalize a proof failed verification. The user will provide the original proof, your previous attempt, and the verification errors. Fix the Lean4 code so it passes verification.

The verifier uses Lean4 with Mathlib. Start every file with \`import Mathlib\`.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Start with \`import Mathlib\`
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by norm_num\`, \`by exact\`, \`by linarith\`, \`by aesop\`)
- Address all verification errors shown in the error output
- Return only the corrected Lean4 code with no additional commentary`;

const LEAN_SCHEMA = {
  type: "object",
  properties: {
    lean_code: {
      type: "string",
      description: "Valid Lean4 code. Must begin with 'import Mathlib'.",
      pattern: "^import Mathlib",
    },
  },
  required: ["lean_code"],
  additionalProperties: false,
};

/** Guarantee the code starts with 'import Mathlib' even if the model ignores the pattern. */
function ensureImportMathlib(code: string): string {
  const trimmed = code.trim();
  return trimmed.startsWith("import Mathlib") ? trimmed : `import Mathlib\n\n${trimmed}`;
}

/** Fallback for when the provider ignores response_format and returns a plain string.
 *  Strips markdown code fences that models sometimes wrap around Lean output. */
function extractLeanCode(raw: string): string {
  const fenced = raw.match(/```(?:lean4?|)[\r\n]([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

function mockResponse(informalProof: string, isRetry: boolean): string {
  const snippet = informalProof.slice(0, 60).replace(/\n/g, " ");
  return `-- Mock Lean4 output (no API key configured)${isRetry ? " [RETRY]" : ""}
-- From: "${snippet}${informalProof.length > 60 ? "..." : ""}"

import Mathlib

theorem example_formalization (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q :=
  ⟨hp, hq⟩`;
}

export async function POST(request: NextRequest) {
  const { informalProof, previousAttempt, errors, instruction } = await request.json();

  const isRetry = Boolean(previousAttempt && errors);
  const systemPrompt = isRetry ? RETRY_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;
  let userContent = isRetry
    ? `Original proof:\n${informalProof}\n\nPrevious Lean4 attempt:\n${previousAttempt}\n\nVerification errors:\n${errors}`
    : informalProof;
  if (instruction) {
    userContent += `\n\nAdditional instruction: ${instruction}`;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ output_config: { format: { type: "json_schema", schema: LEAN_SCHEMA } } } as any),
    });
    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    let leanCode: string;
    try {
      leanCode = (JSON.parse(raw) as { lean_code?: string }).lean_code ?? raw;
    } catch {
      leanCode = extractLeanCode(raw);
    }
    return NextResponse.json({ leanCode: ensureImportMathlib(leanCode) });
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
      response_format: {
        type: "json_schema",
        json_schema: { name: "lean_output", strict: true, schema: LEAN_SCHEMA },
      },
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
  const raw = data.choices?.[0]?.message?.content ?? "";
  let leanCode: string;
  try {
    leanCode = (JSON.parse(raw) as { lean_code?: string }).lean_code ?? raw;
  } catch {
    leanCode = extractLeanCode(raw);
  }

  return NextResponse.json({ leanCode: ensureImportMathlib(leanCode) });
}
