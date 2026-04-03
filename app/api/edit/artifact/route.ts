import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { DEEPSEEK_CHAT as OPENROUTER_MODEL } from "@/app/lib/llm/models";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";

/**
 * Editing route for structured JSON artifacts (causal-graph, statistical-model, etc.).
 * Accepts the current JSON content, an instruction, and an optional text selection.
 * Returns the modified JSON in the same schema.
 */

const SYSTEM_PROMPT_WHOLE = `You are an editing assistant for structured JSON artifacts. The user will give you a JSON document and an editing instruction. Apply the instruction to the JSON and return ONLY the modified JSON object — no commentary, no markdown fences, no explanation. Preserve the exact same schema (all required keys, correct types). Do not add or remove top-level keys.`;

const SYSTEM_PROMPT_INLINE = `You are an editing assistant for structured JSON artifacts. The user will give you a JSON document and a selected portion of that JSON text. Apply the user's instruction ONLY to the selected portion and return ONLY the edited version of the selected text — no commentary, no markdown fences, no explanation. The result must be valid within the surrounding JSON context (e.g. properly quoted strings, valid numbers, etc.).`;

function mockWholeResponse(content: string, instruction: string): string {
  return `${content.slice(0, -1)}\n  // mock edit: "${instruction.slice(0, 60)}"\n}`;
}

function mockInlineResponse(selectionText: string, instruction: string): string {
  return `[mock: "${instruction.slice(0, 40)}" applied to "${selectionText.slice(0, 30)}"]`;
}

export async function POST(request: NextRequest) {
  const { content, instruction, selection } = await request.json() as {
    content: string;
    instruction: string;
    selection?: { start: number; end: number; text: string };
  };

  if (!content || !instruction) {
    return NextResponse.json(
      { error: "content and instruction are required" },
      { status: 400 },
    );
  }

  const isInline = selection != null;
  const systemPrompt = isInline ? SYSTEM_PROMPT_INLINE : SYSTEM_PROMPT_WHOLE;

  const userContent = isInline
    ? `JSON document:\n${content}\n\nSelected text (characters ${selection.start}–${selection.end}):\n${selection.text}\n\nInstruction: ${instruction}`
    : `JSON document:\n${content}\n\nInstruction: ${instruction}`;

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: isInline ? "edit/artifact-inline" : "edit/artifact-whole",
      systemPrompt,
      userContent,
      maxTokens: 8192,
      openRouterModel: OPENROUTER_MODEL,
    });

    if (usage.provider === "mock") {
      if (isInline) {
        return NextResponse.json({ text: mockInlineResponse(selection.text, instruction) });
      }
      return NextResponse.json({ text: mockWholeResponse(content, instruction) });
    }

    if (isInline) {
      // Inline edit: return the replacement text (not necessarily valid JSON on its own)
      return NextResponse.json({ text: responseText });
    }

    // Whole edit: validate that the response is valid JSON
    const cleaned = stripCodeFences(responseText);
    try {
      JSON.parse(cleaned);
      return NextResponse.json({ text: cleaned });
    } catch {
      // Try the raw response before giving up
      try {
        JSON.parse(responseText);
        return NextResponse.json({ text: responseText });
      } catch {
        console.error("[edit/artifact] LLM returned invalid JSON:", responseText.slice(0, 300));
        return NextResponse.json(
          { error: "LLM response was not valid JSON", details: responseText.slice(0, 500) },
          { status: 502 },
        );
      }
    }
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[edit/artifact] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
