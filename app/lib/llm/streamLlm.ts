import { randomUUID } from "crypto";
import { computeCost } from "./costs";
import { appendAnalyticsEntry } from "@/app/lib/analytics/persist";
import { computeHash, getCachedResult, setCachedResult } from "./cache";
import {
  OPENROUTER_API_URL,
  DEFAULT_ANTHROPIC_MODEL,
  getAnthropicClient,
} from "./callLlm";
import type { LlmCallUsage } from "./callLlm";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

const encoder = new TextEncoder();

/** Format a single SSE event as a Uint8Array. */
export function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Extract a `details` property from an error, if present. */
function getErrorDetails(err: unknown): string {
  return (typeof err === "object" && err !== null && "details" in err)
    ? String((err as Record<string, unknown>).details)
    : "";
}

type StreamLlmOptions = {
  endpoint: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  anthropicModel?: string;
  openRouterModel?: string;
};

/** Record analytics and write to cache (same as callLlm's recordAndCache). */
async function recordAndCache(
  endpoint: string,
  usage: LlmCallUsage,
  text: string,
  cacheHash: string,
): Promise<void> {
  try {
    appendAnalyticsEntry({
      id: randomUUID(),
      endpoint,
      ...usage,
      timestamp: new Date().toISOString(),
    });
  } catch { /* persistence failure must not break LLM calls */ }
  if (text) {
    try { await setCachedResult(cacheHash, { text, usage }); } catch { /* non-fatal */ }
  }
}

/**
 * Streaming LLM call returning a ReadableStream of SSE events.
 *
 * SSE protocol:
 *   event: token   — { text: "partial chunk" }
 *   event: done    — { text: "full accumulated text", usage: LlmCallUsage }
 *   event: error   — { error: "message", details: "..." }
 *
 * Provider chain mirrors callLlm(): Anthropic → OpenRouter → mock.
 * Cache hits emit a single `done` event.
 */
export function streamLlm({
  endpoint,
  systemPrompt,
  userContent,
  maxTokens,
  anthropicModel,
  openRouterModel,
}: StreamLlmOptions): ReadableStream<Uint8Array> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const effectiveModel = anthropicKey
    ? (anthropicModel ?? DEFAULT_ANTHROPIC_MODEL)
    : (openRouterKey && openRouterModel)
      ? openRouterModel
      : "mock";

  const cacheHash = computeHash(effectiveModel, systemPrompt, userContent, maxTokens);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Check cache
        const cached = await getCachedResult(effectiveModel, systemPrompt, userContent, maxTokens);
        if (cached) {
          console.log(`[${endpoint}] stream cache hit (model: ${effectiveModel}, hash: ${cacheHash.slice(0, 8)})`);

          if (process.env.SIMULATE_STREAM_FROM_CACHE === "true") {
            // Simulate token-by-token streaming from cache for testing
            // partial-JSON rendering without making expensive API calls.
            console.log(`[${endpoint}] simulating stream from cache (${cached.text.length} chars)`);
            await simulateStreamFromCache(controller, cached.text, cached.usage);
          } else {
            controller.enqueue(sseEvent("done", { text: cached.text, usage: cached.usage }));
          }
          controller.close();
          return;
        }

        if (anthropicKey) {
          await streamAnthropic(controller, {
            apiKey: anthropicKey,
            model: anthropicModel ?? DEFAULT_ANTHROPIC_MODEL,
            systemPrompt,
            userContent,
            maxTokens,
            endpoint,
            cacheHash,
          });
        } else if (openRouterKey && openRouterModel) {
          await streamOpenRouter(controller, {
            apiKey: openRouterKey,
            model: openRouterModel,
            systemPrompt,
            userContent,
            maxTokens,
            endpoint,
            cacheHash,
          });
        } else {
          // Mock fallback
          console.warn(`[${endpoint}] No API key configured — returning mock stream.`);
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
          } catch { /* non-fatal */ }
          controller.enqueue(sseEvent("done", { text: "", usage }));
          controller.close();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const details = getErrorDetails(err);
        console.error(`[${endpoint}] Stream error:`, message, details);
        try {
          controller.enqueue(sseEvent("error", { error: message, details }));
        } catch { /* controller may already be closed */ }
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
}

/**
 * Simulate token-by-token streaming from a cached result.
 * Emits chunks of ~20 chars with a small delay between each,
 * so the client sees the same partial-JSON rendering behavior
 * as a real LLM stream.
 */
async function simulateStreamFromCache(
  controller: ReadableStreamDefaultController<Uint8Array>,
  text: string,
  usage: LlmCallUsage,
): Promise<void> {
  const CHUNK_SIZE = 20;
  const DELAY_MS = 15;

  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    const chunk = text.slice(i, i + CHUNK_SIZE);
    controller.enqueue(sseEvent("token", { text: chunk }));
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  controller.enqueue(sseEvent("done", { text, usage }));
}

type StreamProviderOptions = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  endpoint: string;
  cacheHash: string;
};

async function streamAnthropic(
  controller: ReadableStreamDefaultController<Uint8Array>,
  opts: StreamProviderOptions,
): Promise<void> {
  const client = getAnthropicClient(opts.apiKey);
  const start = Date.now();

  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.userContent }],
  });

  let accumulated = "";

  stream.on("text", (text) => {
    accumulated += text;
    controller.enqueue(sseEvent("token", { text }));
  });

  const finalMessage = await stream.finalMessage();
  const latencyMs = Date.now() - start;

  const usage: LlmCallUsage = {
    provider: "anthropic",
    model: opts.model,
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    costUsd: computeCost(opts.model, finalMessage.usage.input_tokens, finalMessage.usage.output_tokens),
    latencyMs,
  };

  await recordAndCache(opts.endpoint, usage, accumulated, opts.cacheHash);
  controller.enqueue(sseEvent("done", { text: accumulated, usage }));
  controller.close();
}

async function streamOpenRouter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  opts: StreamProviderOptions,
): Promise<void> {
  const start = Date.now();

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const err = new Error(`OpenRouter API error: ${response.status}`);
    (err as Error & { details: string }).details = errorBody;
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("OpenRouter response has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data: ")) continue;

      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      try {
        const chunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          controller.enqueue(sseEvent("token", { text: delta }));
        }
        // Extract usage from final chunk if present
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }

  const latencyMs = Date.now() - start;
  const usage: LlmCallUsage = {
    provider: "openrouter",
    model: opts.model,
    inputTokens,
    outputTokens,
    costUsd: computeCost(opts.model, inputTokens, outputTokens),
    latencyMs,
  };

  await recordAndCache(opts.endpoint, usage, accumulated, opts.cacheHash);
  controller.enqueue(sseEvent("done", { text: accumulated, usage }));
  controller.close();
}
