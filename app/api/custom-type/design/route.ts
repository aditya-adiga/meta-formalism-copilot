import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import { CLAUDE_OPUS as OPENROUTER_MODEL } from "@/app/lib/llm/models";

const META_SYSTEM_PROMPT = `You are an expert at designing system prompts for LLM-based artifact generation.

The user is building a custom "formalization" type for an analytical tool. They will describe what kind of artifact they want — your job is to produce a complete definition including a high-quality system prompt that will instruct an LLM to generate that artifact from source text.

Return a JSON object with this exact shape:
{
  "name": "string (concise name for this artifact type, 2-4 words)",
  "chipLabel": "string (very short label for a UI chip, 1-3 words)",
  "description": "string (1-2 sentence description of what this artifact produces)",
  "whenToUse": "string (1-2 sentences about when this type is most useful)",
  "systemPrompt": "string (the full system prompt for the LLM that will generate this artifact — be detailed and specific about the output format)",
  "outputFormat": "json" or "text"
}

Guidelines for the system prompt you write:
- If outputFormat is "json", the system prompt MUST instruct the LLM to return a specific JSON structure. Define the exact shape with field names and types.
- If outputFormat is "text", the system prompt should describe the desired text format (e.g. sections, bullet points, prose).
- The system prompt should instruct the LLM to analyze "[Source Text]" that will be provided in the user message.
- Include "Return ONLY the JSON object, no commentary or markdown fences" for JSON output formats.
- Be specific about what makes good output for this artifact type.

Return ONLY the JSON object, no commentary or markdown fences.`;

// Note: This route does NOT use handleArtifactRoute because it has different semantics —
// it generates a type *definition* (system prompt + metadata), not an artifact from source text.
// The input validation, response parsing, and mock handling differ from artifact generation.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userDescription, currentDraft, refinementInstruction } = body;

  if (!userDescription && !refinementInstruction) {
    return NextResponse.json({ error: "userDescription or refinementInstruction is required" }, { status: 400 });
  }

  const parts: string[] = [];

  if (userDescription) {
    parts.push(`[User's Description of Desired Artifact Type]\n${userDescription}`);
  }

  if (currentDraft) {
    parts.push(`[Current Draft — refine this]\n${JSON.stringify(currentDraft, null, 2)}`);
  }

  if (refinementInstruction) {
    parts.push(`[Refinement Instruction]\n${refinementInstruction}`);
  }

  const userMessage = parts.join("\n\n");

  try {
    const { text: responseText, usage } = await callLlm({
      endpoint: "custom-type/design",
      systemPrompt: META_SYSTEM_PROMPT,
      userContent: userMessage,
      maxTokens: 4096,
      openRouterModel: OPENROUTER_MODEL,
    });

    if (usage.provider === "mock") {
      return NextResponse.json({
        definition: {
          name: "Mock Custom Type",
          chipLabel: "Mock",
          description: "A mock custom artifact type for testing.",
          whenToUse: "When testing the custom type designer.",
          systemPrompt: "You are a mock analyzer. Return a JSON object with a summary field.",
          outputFormat: "json",
        },
      });
    }

    try {
      const parsed = JSON.parse(stripCodeFences(responseText));

      // Validate required fields so the client gets a usable definition
      if (typeof parsed.name !== "string" || !parsed.name) {
        return NextResponse.json({ error: "LLM response missing required 'name' field", details: responseText.slice(0, 500) }, { status: 502 });
      }
      if (typeof parsed.systemPrompt !== "string" || !parsed.systemPrompt) {
        return NextResponse.json({ error: "LLM response missing required 'systemPrompt' field", details: responseText.slice(0, 500) }, { status: 502 });
      }
      if (parsed.outputFormat !== "json" && parsed.outputFormat !== "text") {
        parsed.outputFormat = "json"; // default to JSON if missing/invalid
      }

      return NextResponse.json({ definition: parsed });
    } catch {
      return NextResponse.json(
        { error: "Failed to parse design response", details: responseText.slice(0, 500) },
        { status: 502 },
      );
    }
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json({ error: err.message, details: err.details }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Design call failed: ${message}` }, { status: 502 });
  }
}
