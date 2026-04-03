import { NextRequest, NextResponse } from "next/server";
import { callLlm, OpenRouterError } from "@/app/lib/llm/callLlm";
import type { ResponseFormat } from "@/app/lib/llm/callLlm";
import { streamLlm, SSE_HEADERS } from "@/app/lib/llm/streamLlm";
import { removeCachedResult } from "@/app/lib/llm/cache";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";
import { stripCodeFences } from "@/app/lib/utils/stripCodeFences";
import { CLAUDE_OPUS as OPENROUTER_MODEL } from "@/app/lib/llm/models";

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

type ArtifactRouteConfig = {
  endpoint: string;
  systemPrompt: string;
  responseKey: string;
  mockResponse: (sourceText: string) => unknown;
  maxTokens?: number;
  /** How to parse the LLM response. Default: "json" (parse as JSON). "text" returns raw text. */
  parseResponse?: "json" | "text";
  /** When provided, enforces structured JSON output via OpenRouter's response_format. */
  responseFormat?: ResponseFormat;
  /** Optional: transform the request body before building the user message (e.g. legacy field mapping). */
  transformBody?: (body: Record<string, unknown>) => ArtifactGenerationRequest;
};

/**
 * Generic POST handler for artifact generation routes.
 * Parses the uniform ArtifactGenerationRequest, calls callLlm(), parses JSON response.
 */
export async function handleArtifactRoute(
  request: NextRequest,
  config: ArtifactRouteConfig,
): Promise<NextResponse> {
  const rawBody = await request.json();
  const body: ArtifactGenerationRequest = config.transformBody
    ? config.transformBody(rawBody)
    : rawBody;

  if (!body.sourceText) {
    return NextResponse.json({ error: "sourceText is required" }, { status: 400 });
  }

  const wantStream = Boolean(rawBody.stream);
  const userMessage = buildUserMessage(body);

  // Streaming path: all artifact types use real token streaming.
  // JSON artifacts stream raw tokens for partial-JSON parsing on the client.
  // Note: streaming does not pass responseFormat (JSON schema enforcement) because
  // provider streaming APIs don't support it consistently. The system prompt is
  // relied upon to produce correctly-shaped JSON. The batch path enforces the schema
  // as an extra safety net via responseFormat.
  if (wantStream) {
    const stream = streamLlm({
      endpoint: config.endpoint,
      systemPrompt: config.systemPrompt,
      userContent: userMessage,
      maxTokens: config.maxTokens ?? 8192,
      openRouterModel: OPENROUTER_MODEL,
    });
    return new Response(stream, { headers: SSE_HEADERS }) as unknown as NextResponse;
  }

  try {
    const { text: responseText, usage, cacheKey } = await callLlm({
      endpoint: config.endpoint,
      systemPrompt: config.systemPrompt,
      userContent: userMessage,
      maxTokens: config.maxTokens ?? 8192,
      openRouterModel: OPENROUTER_MODEL,
      responseFormat: config.responseFormat,
    });

    if (usage.provider === "mock") {
      return NextResponse.json({ [config.responseKey]: config.mockResponse(body.sourceText) });
    }

    if (config.parseResponse === "text") {
      return NextResponse.json({ [config.responseKey]: responseText });
    }

    try {
      const parsed = JSON.parse(stripCodeFences(responseText));
      return NextResponse.json({ [config.responseKey]: parsed });
    } catch {
      if (cacheKey) {
        try { await removeCachedResult(cacheKey.model, cacheKey.systemPrompt, cacheKey.userContent, cacheKey.maxTokens); } catch { /* ignore */ }
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

