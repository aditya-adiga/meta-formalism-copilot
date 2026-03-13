import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-4-6";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a Lean 4 error explanation assistant. The user will provide Lean 4 code and the errors produced by \`lake build\`.

Explain each error in plain English. Focus on:
- What the error message means
- What part of the code triggered it
- Why Lean considers it an error

Do NOT suggest fixes or provide corrected code. The goal is understanding, not repair.

Keep explanations concise and accessible to someone learning Lean 4.`;

function mockResponse(): string {
  return "No API key is configured, so error explanation is unavailable. Add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local to enable this feature.";
}

export async function POST(request: NextRequest) {
  const { leanCode, errors } = await request.json();

  const userContent = `Lean 4 code:\n\`\`\`lean\n${leanCode}\n\`\`\`\n\nErrors from \`lake build\`:\n\`\`\`\n${errors}\n\`\`\``;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ explanation: text });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn(
      "[explanation/lean-error] No API key configured — returning mock response.\n\n To generate real responses, add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local",
    );
    return NextResponse.json({ explanation: mockResponse() });
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
        { role: "user", content: userContent },
      ],
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      "[explanation/lean-error] OpenRouter error:",
      response.status,
      errorBody,
    );
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 },
    );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ explanation: text });
}
