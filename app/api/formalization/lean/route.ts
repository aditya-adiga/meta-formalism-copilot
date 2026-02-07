import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "ai-mo/kimina-prover-72b";

const BASE_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. The user will provide an informal or semi-formal mathematical proof. Convert it into valid Lean4 code.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Include necessary imports (e.g. import Mathlib)
- Use tactic-style proofs where appropriate
- Return only the Lean4 code with no additional commentary`;

const RETRY_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. Your previous attempt to formalize a proof failed verification. The user will provide the original proof, your previous attempt, and the verification errors. Fix the Lean4 code so it passes verification.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Include necessary imports (e.g. import Mathlib)
- Use tactic-style proofs where appropriate
- Address all verification errors
- Return only the corrected Lean4 code with no additional commentary`;

function mockResponse(informalProof: string, isRetry: boolean): string {
  const snippet = informalProof.slice(0, 60).replace(/\n/g, " ");
  return `-- Mock Lean4 output (no API key configured)${isRetry ? " [RETRY]" : ""}
-- From: "${snippet}${informalProof.length > 60 ? "..." : ""}"

import Mathlib

theorem example_formalization (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q := by
  exact ⟨hp, hq⟩

#check example_formalization`;
}

export async function POST(request: NextRequest) {
  const { informalProof, previousAttempt, errors } = await request.json();

  const isRetry = Boolean(previousAttempt && errors);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[formalization/lean] No OPENROUTER_API_KEY — returning mock response.\n\n To generate real responses, add your OpenRouter API key to .env.local");
    return NextResponse.json({ leanCode: mockResponse(informalProof, isRetry) });
  }

  const systemPrompt = isRetry ? RETRY_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;

  const userContent = isRetry
    ? `Original proof:\n${informalProof}\n\nPrevious Lean4 attempt:\n${previousAttempt}\n\nVerification errors:\n${errors}`
    : informalProof;

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
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
