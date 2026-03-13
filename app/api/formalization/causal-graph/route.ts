import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { removeCachedResult } from "@/app/lib/llm/cache";

const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";

const SYSTEM_PROMPT = `You are a causal reasoning analyst. Given source text and optional context, extract the causal structure: identify variables, causal relationships (edges), potential confounders, and summarize the causal model.

Return a JSON object with this exact shape:
{
  "variables": [
    { "id": "string", "label": "string", "description": "string" }
  ],
  "edges": [
    {
      "from": "string (variable id)",
      "to": "string (variable id)",
      "weight": number (-1 to 1, strength and direction),
      "mechanism": "string (brief explanation of the causal pathway)"
    }
  ],
  "confounders": [
    {
      "id": "string",
      "label": "string",
      "affectedEdges": ["from->to keys of edges this confounder affects"]
    }
  ],
  "summary": "string (natural language summary of the causal structure)"
}

Important:
- Variable IDs must be short, lowercase, hyphenated (e.g. "sleep-quality", "stress-level")
- Edge "from" and "to" must reference valid variable IDs
- Weight should reflect both strength (magnitude) and direction (positive/negative)
- Include confounders only when the source text implies or explicitly mentions them
- The summary should be 2-4 sentences explaining the overall causal picture
- Return ONLY the JSON object, no commentary or markdown fences`;

type ArtifactGenerationRequest = {
  sourceText: string;
  context: string;
  nodeId?: string;
  nodeLabel?: string;
  previousAttempt?: string;
  instruction?: string;
};

function buildUserMessage(req: ArtifactGenerationRequest): string {
  const parts: string[] = [];

  if (req.context) {
    parts.push(`[Context]\n${req.context}`);
  }

  if (req.nodeId && req.nodeLabel) {
    parts.push(`[Node: ${req.nodeLabel}]`);
  }

  parts.push(`[Source Text]\n${req.sourceText}`);

  if (req.previousAttempt) {
    parts.push(`[Previous Attempt — refine this]\n${req.previousAttempt}`);
  }

  if (req.instruction) {
    parts.push(`[Additional Instruction]\n${req.instruction}`);
  }

  return parts.join("\n\n");
}

function mockResponse(sourceText: string) {
  const snippet = sourceText.slice(0, 60).replace(/\n/g, " ");
  return {
    variables: [
      { id: "var-a", label: "Variable A", description: `Mock variable from: "${snippet}..."` },
      { id: "var-b", label: "Variable B", description: "Mock dependent variable" },
    ],
    edges: [
      { from: "var-a", to: "var-b", weight: 0.7, mechanism: "Mock causal mechanism" },
    ],
    confounders: [],
    summary: `Mock causal graph extracted from source text. Variable A causes Variable B via a mock mechanism.`,
  };
}

/** Strip markdown code fences if present */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?[\r\n]([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

export async function POST(request: NextRequest) {
  const body: ArtifactGenerationRequest = await request.json();

  if (!body.sourceText) {
    return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
  }

  const userMessage = buildUserMessage(body);

  try {
    const { text: responseText, usage, cacheKey } = await callLlm({
      endpoint: "formalization/causal-graph",
      systemPrompt: SYSTEM_PROMPT,
      userContent: userMessage,
      maxTokens: 8192,
      openRouterModel: OPENROUTER_MODEL,
    });

    if (usage.provider === "mock") {
      return NextResponse.json({ causalGraph: mockResponse(body.sourceText) });
    }

    try {
      const causalGraph = JSON.parse(extractJson(responseText));
      return NextResponse.json({ causalGraph });
    } catch {
      if (cacheKey) {
        try { removeCachedResult(cacheKey.model, cacheKey.systemPrompt, cacheKey.userContent, cacheKey.maxTokens); } catch { /* ignore */ }
      }
      const preview = responseText.slice(0, 500);
      console.error("[formalization/causal-graph] Failed to parse LLM response as JSON:", preview);
      return NextResponse.json(
        { error: "LLM response was not valid JSON", details: preview },
        { status: 502 },
      );
    }
  } catch (err) {
    if (err instanceof OpenRouterError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[formalization/causal-graph] Unexpected error:", message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
