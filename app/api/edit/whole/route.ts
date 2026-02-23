import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = "You are an editing assistant. The user will give you a text document and an instruction. Rewrite the entire document according to the instruction. Return only the edited document with no additional commentary.";

function mockResponse(fullText: string, instruction: string): string {
  return [
    `-- Mock whole-text edit (no API key configured)`,
    `-- Instruction: "${instruction.slice(0, 80)}${instruction.length > 80 ? "..." : ""}"`,
    "",
    fullText,
    "",
    "-- [end of mock edit — original text returned unchanged]",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  const { fullText, instruction } = await request.json();

  const userContent = `Text:\n${fullText}\n\nInstruction: ${instruction}`;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const client = new Anthropic({ apiKey: anthropicKey });
    const message = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
    const text = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ text });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.warn("[edit/whole] No API key configured — returning mock response");
    return NextResponse.json({ text: mockResponse(fullText, instruction) });
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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[edit/whole] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 },
    );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ text });
}
