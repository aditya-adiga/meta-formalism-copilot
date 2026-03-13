import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import { removeCachedResult } from "@/app/lib/llm/cache";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";

const OPENROUTER_MODEL = "anthropic/claude-opus-4.6";

export function buildUserMessage(req: ArtifactGenerationRequest): string {
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

/** Strip markdown code fences if present */
export function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?[\r\n]([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

type ArtifactRouteConfig = {
  endpoint: string;
  systemPrompt: string;
  responseKey: string;
  mockResponse: (sourceText: string) => unknown;
  maxTokens?: number;
};

/**
 * Generic POST handler for artifact generation routes.
 * Parses the uniform ArtifactGenerationRequest, calls callLlm(), parses JSON response.
 */
export async function handleArtifactRoute(
  request: NextRequest,
  config: ArtifactRouteConfig,
): Promise<NextResponse> {
  const body: ArtifactGenerationRequest = await request.json();

  if (!body.sourceText) {
    return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
  }

  const userMessage = buildUserMessage(body);

  try {
    const { text: responseText, usage, cacheKey } = await callLlm({
      endpoint: config.endpoint,
      systemPrompt: config.systemPrompt,
      userContent: userMessage,
      maxTokens: config.maxTokens ?? 8192,
      openRouterModel: OPENROUTER_MODEL,
    });

    if (usage.provider === "mock") {
      return NextResponse.json({ [config.responseKey]: config.mockResponse(body.sourceText) });
    }

    try {
      const parsed = JSON.parse(extractJson(responseText));
      return NextResponse.json({ [config.responseKey]: parsed });
    } catch {
      if (cacheKey) {
        try { removeCachedResult(cacheKey.model, cacheKey.systemPrompt, cacheKey.userContent, cacheKey.maxTokens); } catch { /* ignore */ }
      }
      const preview = responseText.slice(0, 500);
      console.error(`[${config.endpoint}] Failed to parse LLM response as JSON:`, preview);
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
    console.error(`[${config.endpoint}] Unexpected error:`, message);
    return NextResponse.json(
      { error: `LLM call failed: ${message}` },
      { status: 502 },
    );
  }
}
