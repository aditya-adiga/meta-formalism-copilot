import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { computeCost } from "./costs";
import { appendAnalyticsEntry } from "@/app/lib/analytics/persist";
import { computeHash, getCachedResult, setCachedResult } from "./cache";

export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

// Construct a fresh Anthropic client per call. The SDK is cheap to instantiate
// and per-call construction means an env-var rotation (e.g. swapping
// ANTHROPIC_API_KEY in the Vercel dashboard) takes effect on the next request
// without needing a redeploy or process restart.
export function makeAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export class OpenRouterError extends Error {
  status: number;
  details: string;
  constructor(status: number, details: string) {
    super(`OpenRouter API error: ${status}`);
    this.name = "OpenRouterError";
    this.status = status;
    this.details = details;
  }
}

export type LlmCallUsage = {
  provider: "anthropic" | "openrouter" | "mock" | "cache";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

/** OpenRouter-compatible response_format for structured outputs.
 *  See https://openrouter.ai/docs/guides/features/structured-outputs */
export type ResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
};

type CallLlmOptions = {
  endpoint: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  anthropicModel?: string;
  openRouterModel?: string;
  /** When provided, enforces structured JSON output via OpenRouter's response_format.
   *  Only used with the OpenRouter provider (Anthropic direct API does not support this). */
  responseFormat?: ResponseFormat;
};

export type CacheKey = {
  model: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
};

type CallLlmResult = {
  text: string;
  usage: LlmCallUsage;
  cacheKey?: CacheKey;
};

/** Record analytics and write to cache. Failures are silently ignored
 *  so they never break the LLM call that produced the result. */
async function recordAndCache(
  endpoint: string,
  usage: LlmCallUsage,
  text: string,
  cacheHash: string,
  cacheKey: CacheKey,
): Promise<CallLlmResult> {
  try {
    appendAnalyticsEntry({
      id: randomUUID(),
      endpoint,
      ...usage,
      timestamp: new Date().toISOString(),
    });
  } catch { /* persistence failure must not break LLM calls */ }
  const result: CallLlmResult = { text, usage, cacheKey };
  if (text) {
    try { await setCachedResult(cacheHash, result); } catch { /* cache write failure is non-fatal */ }
  }
  return result;
}

/** Centralized LLM call with Anthropic -> OpenRouter -> mock fallback.
 *  Returns the raw text response and usage/cost metadata.
 *  On mock fallback, returns text: "" — the caller provides its own mock text. */
export async function callLlm({
  endpoint,
  systemPrompt,
  userContent,
  maxTokens,
  anthropicModel,
  openRouterModel,
  responseFormat,
}: CallLlmOptions): Promise<CallLlmResult> {
  // Resolve effective model for cache key
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const effectiveModel = anthropicKey
    ? (anthropicModel ?? DEFAULT_ANTHROPIC_MODEL)
    : (openRouterKey && openRouterModel)
      ? openRouterModel
      : "mock";

  // Compute hash once, reuse for cache get and set
  const cacheHash = computeHash(effectiveModel, systemPrompt, userContent, maxTokens);
  const cacheKey: CacheKey = { model: effectiveModel, systemPrompt, userContent, maxTokens };

  // Check cache before making any LLM call
  const cached = await getCachedResult(effectiveModel, systemPrompt, userContent, maxTokens);
  if (cached) {
    console.log(`[${endpoint}] cache hit (model: ${effectiveModel}, hash: ${cacheHash.slice(0, 8)})`);
    return { text: cached.text, usage: cached.usage };
  }

  if (anthropicKey) {
    const model = anthropicModel ?? DEFAULT_ANTHROPIC_MODEL;
    const start = Date.now();
    const client = makeAnthropicClient(anthropicKey);
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      ...(responseFormat && {
        output_config: {
          format: {
            type: "json_schema" as const,
            schema: responseFormat.json_schema.schema,
          },
        },
      }),
    });
    const latencyMs = Date.now() - start;
    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const usage: LlmCallUsage = {
      provider: "anthropic",
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      costUsd: computeCost(model, message.usage.input_tokens, message.usage.output_tokens),
      latencyMs,
    };
    return recordAndCache(endpoint, usage, text, cacheHash, cacheKey);
  }

  if (openRouterKey && openRouterModel) {
    const start = Date.now();
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterKey}`,
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        ...(responseFormat && { response_format: responseFormat }),
      }),
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text();
      // Log only status + endpoint here; the body can echo parts of the request
      // and we don't want it on disk in plaintext. The body still rides on
      // OpenRouterError so route handlers can decide what (if anything) to
      // surface to the caller.
      console.error(`[${endpoint}] OpenRouter error: status=${response.status}`);
      throw new OpenRouterError(response.status, errorBody);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const usage: LlmCallUsage = {
      provider: "openrouter",
      model: openRouterModel,
      inputTokens,
      outputTokens,
      costUsd: computeCost(openRouterModel, inputTokens, outputTokens),
      latencyMs,
    };
    return recordAndCache(endpoint, usage, text, cacheHash, cacheKey);
  }

  // Mock fallback — caller provides its own mock text
  console.warn(`[${endpoint}] No API key configured — returning mock response.\n\n To generate real responses, add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local`);
  const usage: LlmCallUsage = {
    provider: "mock",
    model: "mock",
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
  };
  try {
    appendAnalyticsEntry({
      id: randomUUID(),
      endpoint,
      ...usage,
      timestamp: new Date().toISOString(),
    });
  } catch { /* persistence failure must not break LLM calls */ }
  return { text: "", usage };
}
