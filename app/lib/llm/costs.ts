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

/**
 * Per-endpoint estimation parameters: which model is used and median output
 * tokens observed. Model assignments mirror the imports in each API route
 * (see app/api/ and app/lib/formalization/artifactRoute.ts).
 *
 * Median output tokens derived from analytics data (246 calls, 2026-04-16).
 * See docs/decisions/007-cost-estimation-model.md.
 */
const ENDPOINT_ESTIMATES: Record<string, { model: string; outputTokens: number }> = {
  "decomposition/extract":              { model: "claude-sonnet-4-6", outputTokens: 2100 },
  "formalization/semiformal":           { model: "claude-sonnet-4-6", outputTokens: 1250 },
  "formalization/lean":                 { model: "claude-sonnet-4-6", outputTokens: 1450 },
  "formalization/causal-graph":         { model: "claude-sonnet-4-6", outputTokens: 1500 },
  "formalization/statistical-model":    { model: "claude-sonnet-4-6", outputTokens: 1150 },
  "formalization/property-tests":       { model: "claude-sonnet-4-6", outputTokens: 2250 },
  "formalization/counterexamples":      { model: "claude-sonnet-4-6", outputTokens: 2000 },
  "formalization/balanced-perspectives": { model: "claude-sonnet-4-6", outputTokens: 2050 },
  "formalization/dialectical-map":      { model: "claude-sonnet-4-6", outputTokens: 2400 },
  "edit/whole":                         { model: "deepseek/deepseek-chat-v3-0324", outputTokens: 800 },
};
const DEFAULT_ESTIMATE = { model: "claude-sonnet-4-6", outputTokens: 1750 };

/** Map an artifact type to its analytics endpoint key. */
function artifactEndpoint(artifactType: string): string {
  if (artifactType === "decomposition") return "decomposition/extract";
  return `formalization/${artifactType}`;
}

/**
 * Estimated cost for one or more LLM calls based on per-endpoint model
 * pricing and median output tokens.
 *
 * Pass `artifactTypes` (e.g. ["semiformal", "lean"]) to get a per-endpoint
 * estimate. Falls back to default Sonnet estimate when no types are provided.
 */
export function estimateCost(
  inputCharLength: number,
  artifactTypes?: string[],
): number {
  const inputTokens = Math.ceil(inputCharLength / 4);
  if (!artifactTypes || artifactTypes.length === 0) {
    return computeCost(DEFAULT_ESTIMATE.model, inputTokens, DEFAULT_ESTIMATE.outputTokens);
  }
  return artifactTypes.reduce((sum, type) => {
    const endpoint = artifactEndpoint(type);
    const est = ENDPOINT_ESTIMATES[endpoint] ?? DEFAULT_ESTIMATE;
    return sum + computeCost(est.model, inputTokens, est.outputTokens);
  }, 0);
}
