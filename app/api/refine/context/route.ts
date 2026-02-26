import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";

const OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324";

const ACTION_PROMPTS: Record<string, string> = {
  elaborate: "Expand this context description with more detail, examples, and specificity. Keep the same intent but make it richer and more thorough.",
  shorten: "Condense this context description to its essential meaning. Remove redundancy and keep only the core intent.",
  formalize: "Rewrite this context description using precise, formal academic language. Make it suitable for a rigorous mathematical or theoretical treatment.",
  clarify: "Rewrite this context description to be clearer and less ambiguous. Resolve any vague terms and make the intent unmistakable.",
};

function mockResponse(text: string, action: string): string {
  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
  const prefix = `[Mock ${actionLabel}] `;
  switch (action) {
    case "elaborate":
      return prefix + text + " Furthermore, this extends to broader considerations including edge cases and alternative framings.";
    case "shorten":
      return prefix + text.split(".").slice(0, 1).join(".") + ".";
    case "formalize":
      return prefix + "Let T denote the theoretical framework described as: " + text;
    case "clarify":
      return prefix + "To be precise: " + text;
    default:
      return prefix + text;
  }
}

export async function POST(request: NextRequest) {
  const { text, action } = await request.json();

  const systemPrompt = ACTION_PROMPTS[action];
  if (!systemPrompt) {
    return NextResponse.json(
      { error: `Unknown refinement action: ${action}` },
      { status: 400 },
    );
  }

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: "refine/context",
      systemPrompt,
      userContent: text,
      maxTokens: 1024,
      openRouterModel: OPENROUTER_MODEL,
    });

    const refined = usage.provider === "mock" ? mockResponse(text, action) : responseText;
    return NextResponse.json({ text: refined, _usage: { ...usage, endpoint: "refine/context", timestamp: new Date().toISOString() } });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    throw err;
  }
}
