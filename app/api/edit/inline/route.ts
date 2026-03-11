import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";


const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const SYSTEM_PROMPT = "You are an editing assistant. The user will give you a full text document and a selected portion. Apply the user's instruction ONLY to the selected portion and return only the edited version of the selected text, with no additional commentary.";

function mockResponse(fullText: string, selection: { start: number; end: number; text: string }, instruction: string): string {
  const mockEdit = `[mock edit: "${instruction}" applied to "${selection.text.slice(0, 40)}${selection.text.length > 40 ? "..." : ""}"]`;
  return mockEdit;
}

export async function POST(request: NextRequest) {
  const { fullText, selection, instruction } = await request.json();

  const userContent = `Full text:\n${fullText}\n\nSelected text (characters ${selection.start}–${selection.end}):\n${selection.text}\n\nInstruction: ${instruction}`;

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: "edit/inline",
      systemPrompt: SYSTEM_PROMPT,
      userContent,
      maxTokens: 4096,
      openRouterModel: OPENROUTER_MODEL,
    });

    const text = usage.provider === "mock" ? mockResponse(selection, instruction) : responseText;
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[edit/inline] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
