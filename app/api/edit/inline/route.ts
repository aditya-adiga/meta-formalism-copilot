import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { DEEPSEEK_CHAT as OPENROUTER_MODEL } from "@/app/lib/llm/models";
const SYSTEM_PROMPT = "You are an editing assistant. The user will give you a full text document and a selected portion. Apply the user's instruction ONLY to the selected portion and return only the edited version of the selected text, with no additional commentary.";

function mockResponse(selection: { start: number; end: number; text: string }, instruction: string): string {
  return `[mock edit: "${instruction}" applied to "${selection.text.slice(0, 40)}${selection.text.length > 40 ? "..." : ""}"]`;
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
