import Anthropic from "@anthropic-ai/sdk";
import { computeCost } from "./costs";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

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
  provider: "anthropic" | "openrouter" | "mock";
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

type CallLlmResult = {
  text: string;
  usage: LlmCallUsage;
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
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const model = anthropicModel ?? DEFAULT_ANTHROPIC_MODEL;
    const start = Date.now();
    const client = new Anthropic({ apiKey: anthropicKey });
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
    return {
      text,
      usage: {
        provider: "anthropic",
        model,
        inputTokens,
        outputTokens,
        costUsd: computeCost(model, inputTokens, outputTokens),
        latencyMs,
      },
    };
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
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
    return {
      text,
      usage: {
        provider: "openrouter",
        model: openRouterModel,
        inputTokens,
        outputTokens,
        costUsd: computeCost(openRouterModel, inputTokens, outputTokens),
        latencyMs,
      },
    };
  }

  // Mock fallback — caller provides its own mock text
  console.warn(`[${endpoint}] No API key configured — returning mock response.\n\n To generate real responses, add ANTHROPIC_API_KEY or OPENROUTER_API_KEY to .env.local`);
  return {
    text: "",
    usage: {
      provider: "mock",
      model: "mock",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    },
  };
}
