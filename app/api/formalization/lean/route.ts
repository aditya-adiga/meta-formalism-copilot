import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";

const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";

const BASE_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. The user will provide an informal or semi-formal mathematical proof. Convert it into valid Lean4 code.

The verifier uses Lean4 with Mathlib. Start every file with \`import Mathlib\`.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Start with \`import Mathlib\`
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by norm_num\`, \`by exact\`, \`by linarith\`, \`by aesop\`)
- Mark \`def\` declarations as \`noncomputable\` when they use Real.exp, Finset.sum, division, or other Mathlib constructs that depend on classical axioms (e.g. \`noncomputable def gaussianKernel ...\`). Theorems and proofs do not need this tag — only \`def\`, \`abbrev\`, and \`instance\` declarations that produce data.
- Return only the Lean4 code with no additional commentary`;

const BASE_SYSTEM_PROMPT_WITH_CONTEXT = `You are a Lean4 formalization assistant. The user will provide an informal or semi-formal mathematical proof along with verified Lean4 code from dependency nodes. Convert the proof into valid Lean4 code that builds on the provided context.

The verifier uses Lean4 with Mathlib. The dependency context already includes \`import Mathlib\`, so do NOT include any import statements in your output.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Do NOT include \`import Mathlib\` or any other import — imports are handled by the dependency context
- Reference theorems and definitions from the provided context rather than redefining them
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by norm_num\`, \`by exact\`, \`by linarith\`, \`by aesop\`)
- Return only the Lean4 code with no additional commentary`;

const RETRY_SYSTEM_PROMPT = `You are a Lean4 formalization assistant. Your previous attempt to formalize a proof failed verification. The user will provide the original proof, your previous attempt, and the verification errors. Fix the Lean4 code so it passes verification.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Start with \`import Mathlib\`
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by norm_num\`, \`by exact\`, \`by linarith\`, \`by aesop\`)
- Mark \`def\` declarations as \`noncomputable\` when they use Real.exp, Finset.sum, division, or other Mathlib constructs that depend on classical axioms (e.g. \`noncomputable def gaussianKernel ...\`). Theorems and proofs do not need this tag — only \`def\`, \`abbrev\`, and \`instance\` declarations that produce data.
- Address all verification errors shown in the error output
- Return only the corrected Lean4 code with no additional commentary`;

const RETRY_SYSTEM_PROMPT_WITH_CONTEXT = `You are a Lean4 formalization assistant. Your previous attempt to formalize a proof failed verification. The user will provide the original proof, your previous attempt, the verification errors, and verified Lean4 code from dependency nodes. Fix the Lean4 code so it passes verification.

The verifier uses Lean4 with Mathlib. The dependency context already includes \`import Mathlib\`, so do NOT include any import statements in your output.

Guidelines:
- Use Lean4 syntax (not Lean3)
- Do NOT include \`import Mathlib\` or any other import — imports are handled by the dependency context
- Reference theorems and definitions from the provided context rather than redefining them
- Use tactic-style proofs where appropriate (e.g. \`by simp\`, \`by ring\`, \`by omega\`, \`by norm_num\`, \`by exact\`, \`by linarith\`, \`by aesop\`)
- Address all verification errors shown in the error output
- Return only the corrected Lean4 code with no additional commentary`;

/** Strip markdown code fences that LLMs sometimes wrap around Lean output. */
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

theorem example_formalization (P Q : Prop) (hp : P) (hq : Q) : P ∧ Q := by
  exact ⟨hp, hq⟩

#check example_formalization`;
}

export async function POST(request: NextRequest) {
  const { informalProof, previousAttempt, errors, instruction, contextLeanCode } = await request.json();

  const isRetry = Boolean(previousAttempt && errors);
  const hasContext = Boolean(contextLeanCode);
  const systemPrompt = isRetry
    ? (hasContext ? RETRY_SYSTEM_PROMPT_WITH_CONTEXT : RETRY_SYSTEM_PROMPT)
    : (hasContext ? BASE_SYSTEM_PROMPT_WITH_CONTEXT : BASE_SYSTEM_PROMPT);
  let userContent = "";

  if (contextLeanCode) {
    userContent += `The following verified Lean4 code defines theorems and definitions you can reference. Build on these rather than redefining them:\n\n${contextLeanCode}\n\n---\n\n`;
  }

  userContent += isRetry
    ? `Original proof:\n${informalProof}\n\nPrevious Lean4 attempt:\n${previousAttempt}\n\nVerification errors:\n${errors}`
    : informalProof;
  if (instruction) {
    userContent += `\n\nAdditional instruction: ${instruction}`;
  }

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: "formalization/lean",
      systemPrompt,
      userContent,
      maxTokens: 16384,
      openRouterModel: OPENROUTER_MODEL,
    });

    let leanCode = usage.provider === "mock"
      ? mockResponse(informalProof, isRetry)
      : extractLeanCode(responseText);

    // Safety net: strip import lines when context already provides them.
    // LLMs sometimes include `import Mathlib` despite being told not to.
    if (hasContext) {
      leanCode = leanCode
        .split("\n")
        .filter((line) => !/^import\s+/.test(line.trim()))
        .join("\n")
        .replace(/^\n+/, "");
    }

    return NextResponse.json({ leanCode });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[formalization/lean] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
