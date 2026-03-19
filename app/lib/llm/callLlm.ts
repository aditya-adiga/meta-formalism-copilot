import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { computeCost } from "./costs";
import { appendAnalyticsEntry } from "@/app/lib/analytics/persist";
import { computeHash, getCachedResult, setCachedResult } from "./cache";

export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

// Lazy-initialized Anthropic client — reused across calls
let _anthropicClient: Anthropic | null = null;
export function getAnthropicClient(apiKey: string): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
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

type CallLlmOptions = {
  endpoint: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  anthropicModel?: string;
  openRouterModel?: string;
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

  // Check cache before making any LLM call
  const cached = await getCachedResult(effectiveModel, systemPrompt, userContent, maxTokens);
  if (cached) {
    console.log(`[${endpoint}] cache hit (model: ${effectiveModel}, hash: ${cacheHash.slice(0, 8)})`);
    return { text: cached.text, usage: cached.usage };
  }

  if (anthropicKey) {
    const model = anthropicModel ?? DEFAULT_ANTHROPIC_MODEL;
    const start = Date.now();
    const client = getAnthropicClient(anthropicKey);
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    const latencyMs = Date.now() - start;
    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const usage: CallLlmResult["usage"] = {
      provider: "anthropic",
      model,
      inputTokens,
      outputTokens,
      costUsd: computeCost(model, inputTokens, outputTokens),
      latencyMs,
    };
    try {
      appendAnalyticsEntry({
        id: randomUUID(),
        endpoint,
        ...usage,
        timestamp: new Date().toISOString(),
      });
    } catch { /* persistence failure must not break LLM calls */ }
    const cacheKey: CacheKey = { model: effectiveModel, systemPrompt, userContent, maxTokens };
    const result = { text, usage, cacheKey };
    if (text) {
      try { await setCachedResult(cacheHash, result); } catch { /* cache write failure must not break LLM calls */ }
    }
    return result;
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
      }),
    });
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[${endpoint}] OpenRouter error:`, response.status, errorBody);
      throw new OpenRouterError(response.status, errorBody);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const usage: CallLlmResult["usage"] = {
      provider: "openrouter",
      model: openRouterModel,
      inputTokens,
      outputTokens,
      costUsd: computeCost(openRouterModel, inputTokens, outputTokens),
      latencyMs,
    };
    try {
      appendAnalyticsEntry({
        id: randomUUID(),
        endpoint,
        ...usage,
        timestamp: new Date().toISOString(),
      });
    } catch { /* persistence failure must not break LLM calls */ }
    const cacheKey: CacheKey = { model: effectiveModel, systemPrompt, userContent, maxTokens };
    const result = { text, usage, cacheKey };
    if (text) {
      try { await setCachedResult(cacheHash, result); } catch { /* cache write failure must not break LLM calls */ }
    }
    return result;
  }

  // Mock fallback — caller provides its own mock text
  console.warn(`[${endpoint}] No API key configured — returning mock response.\n\n To generate real responses, add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local`);
  const usage: CallLlmResult["usage"] = {
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
