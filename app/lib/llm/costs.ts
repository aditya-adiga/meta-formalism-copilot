/** Static pricing table for models used in this app.
 *  Prices are per-token (not per million tokens). */

type ModelPricing = {
  input: number;  // cost per token
  output: number; // cost per token
};

// Prices sourced from provider pricing pages as of 2025-05.
// Stored as per-token for direct multiplication with token counts.
const PRICING: Record<string, ModelPricing> = {
  // Anthropic direct — same model IDs as used in SDK calls
  "claude-sonnet-4-6":             { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  // OpenRouter model strings
  "anthropic/claude-opus-4.6":     { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  "deepseek/deepseek-chat-v3-0324": { input: 0.27 / 1_000_000, output: 1.10 / 1_000_000 },
};

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return inputTokens * pricing.input + outputTokens * pricing.output;
}
