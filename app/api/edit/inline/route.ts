import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = "You are an editing assistant. The user will give you a full text document and a selected portion. Apply the user's instruction ONLY to the selected portion, keeping the rest unchanged. Return the complete edited document with no additional commentary.";

function mockResponse(fullText: string, selection: { start: number; end: number; text: string }, instruction: string): string {
  const before = fullText.slice(0, selection.start);
  const after = fullText.slice(selection.end);
  const mockEdit = `[mock edit: "${instruction}" applied to "${selection.text.slice(0, 40)}${selection.text.length > 40 ? "..." : ""}"]`;
  return before + mockEdit + after;
}

export async function POST(request: NextRequest) {
  const { fullText, selection, instruction } = await request.json();

  const userContent = `Full text:\n${fullText}\n\nSelected text (characters ${selection.start}–${selection.end}):\n${selection.text}\n\nInstruction: ${instruction}`;

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
    console.warn("[edit/inline] No API key configured — returning mock response");
    return NextResponse.json({ text: mockResponse(fullText, selection, instruction) });
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
    console.error("[edit/inline] OpenRouter error:", response.status, errorBody);
    return NextResponse.json(
      { error: `OpenRouter API error: ${response.status}`, details: errorBody },
      { status: 502 },
    );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ text });
}
