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
  "anthropic/claude-sonnet-4-6":   { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  "anthropic/claude-opus-4.6":     { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  "deepseek/deepseek-chat-v3-0324": { input: 0.27 / 1_000_000, output: 1.10 / 1_000_000 },
};

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

/** Default model for cost estimates (direct Anthropic Sonnet — most common path). */
const ESTIMATE_MODEL = "claude-sonnet-4-6";

/**
 * Median output tokens per endpoint, derived from analytics regression
 * (179 calls, 2026-04-16). See docs/decisions/007-cost-estimation-model.md.
 *
 * Endpoint is the strongest predictor of output tokens (partial eta² = 0.317).
 * Rounded medians used as interim estimates pending more Sonnet data collection.
 */
const MEDIAN_OUTPUT_TOKENS: Record<string, number> = {
  "decomposition/extract":          2100,
  "formalization/semiformal":       1250,
  "formalization/lean":             1450,
  "formalization/causal-graph":     1300,
  "formalization/statistical-model": 1100,
  "formalization/property-tests":   2250,
  "formalization/counterexamples":  2000,
  "formalization/balanced-perspectives": 1750,
  "formalization/dialectical-map":  2400,
  "edit/whole":                     1400,
};
const DEFAULT_OUTPUT_TOKENS = 1750;

/** Map an artifact type to its analytics endpoint key. */
function artifactEndpoint(artifactType: string): string {
  if (artifactType === "decomposition") return "decomposition/extract";
  return `formalization/${artifactType}`;
}

/**
 * Estimated cost for one or more LLM calls based on expected output length.
 *
 * Pass `artifactTypes` (e.g. ["semiformal", "lean"]) to get a per-endpoint
 * estimate. Falls back to a cross-endpoint median when no types are provided.
 */
export function estimateCost(
  inputCharLength: number,
  artifactTypes?: string[],
): number {
  const inputTokens = Math.ceil(inputCharLength / 4);
  if (!artifactTypes || artifactTypes.length === 0) {
    return computeCost(ESTIMATE_MODEL, inputTokens, DEFAULT_OUTPUT_TOKENS);
  }
  return artifactTypes.reduce((sum, type) => {
    const endpoint = artifactEndpoint(type);
    const outputTokens = MEDIAN_OUTPUT_TOKENS[endpoint] ?? DEFAULT_OUTPUT_TOKENS;
    return sum + computeCost(ESTIMATE_MODEL, inputTokens, outputTokens);
  }, 0);
}
