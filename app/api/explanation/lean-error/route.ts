import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { CLAUDE_SONNET as OPENROUTER_MODEL } from "@/app/lib/llm/models";

const SYSTEM_PROMPT = `You are a Lean 4 error explanation assistant. The user will provide Lean 4 code and the errors produced by \`lake build\`.

Explain each error in plain English. Focus on:
- What the error message means
- What part of the code triggered it
- Why Lean considers it an error

Do NOT suggest fixes or provide corrected code. The goal is understanding, not repair.

Keep explanations concise and accessible to someone learning Lean 4.`;

const MOCK_RESPONSE =
  "No API key is configured, so error explanation is unavailable. Add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local to enable this feature.";

export async function POST(request: NextRequest) {
  const { leanCode, errors } = await request.json();

  const userContent = `Lean 4 code:\n\`\`\`lean\n${leanCode}\n\`\`\`\n\nErrors from \`lake build\`:\n\`\`\`\n${errors}\n\`\`\``;

  try {
    const { text, usage } = await callLlm({
      endpoint: "explanation/lean-error",
      systemPrompt: SYSTEM_PROMPT,
      userContent,
      maxTokens: 2048,
      openRouterModel: OPENROUTER_MODEL,
    });

    const explanation = usage.provider === "mock" ? MOCK_RESPONSE : text;
    return NextResponse.json({ explanation });
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return NextResponse.json(
        { error: `OpenRouter API error: ${error.status}`, details: error.details },
        { status: 502 },
      );
    }
    throw error;
  }
}
