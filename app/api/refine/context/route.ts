import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    });
    const refined = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ text: refined });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn("[refine/context] No API key configured — returning mock response");
    return NextResponse.json({ text: mockResponse(text, action) });
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
        { role: "user", content: text },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[refine/context] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 },
    );
  }

  const data = await response.json();
  const refined = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ text: refined });
}
