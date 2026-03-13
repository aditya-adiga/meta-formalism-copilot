import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { DEEPSEEK_CHAT as OPENROUTER_MODEL } from "@/app/lib/llm/models";

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

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: "edit/whole",
      systemPrompt: SYSTEM_PROMPT,
      userContent,
      maxTokens: 4096,
      openRouterModel: OPENROUTER_MODEL,
    });

    const text = usage.provider === "mock" ? mockResponse(fullText, instruction) : responseText;
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[edit/whole] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
