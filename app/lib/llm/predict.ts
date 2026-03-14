/**
 * Cost & latency prediction from input size.
 *
 * Isomorphic module — imports only computeCost (pure arithmetic),
 * safe to use from both server and client code.
 *
 * Priors are extracted from analytics.jsonl via scripts/analyze-analytics.mjs.
 * Re-run that script and update ENDPOINT_PRIORS when enough new data accumulates.
 */

import type { EndpointPrior, CallPrediction } from "@/app/lib/types/analytics";
import { computeCost } from "./costs";

// --- Hardcoded priors from analytics analysis (47 data points, 2026-02-26) ---

export const ENDPOINT_PRIORS: Record<string, EndpointPrior> = {
  "formalization/semiformal": {
    n: 10,
    meanOutputTokens: 2299,
    stddevOutputTokens: 2010,
    meanLatencyMs: 43832,
    stddevLatencyMs: 42936,
    inputTokensToOutputTokens: { slope: 0.037133, intercept: 2211.16, r2: 0.0135 },
    outputTokensToLatencyMs: { slope: 21.253476, intercept: -5038.24, r2: 0.9896 },
    model: "claude-sonnet-4-6",
  },
  "formalization/lean": {
    n: 32,
    meanOutputTokens: 2687,
    stddevOutputTokens: 1750,
    meanLatencyMs: 32399,
    stddevLatencyMs: 19612,
    inputTokensToOutputTokens: { slope: 0.336795, intercept: 713.78, r2: 0.6514 },
    outputTokensToLatencyMs: { slope: 10.819042, intercept: 3328.33, r2: 0.9317 },
    model: "claude-sonnet-4-6",
  },
  "decomposition/extract": {
    n: 5,
    meanOutputTokens: 1885,
    stddevOutputTokens: 2221,
    meanLatencyMs: 29525,
    stddevLatencyMs: 37152,
    inputTokensToOutputTokens: { slope: 0.237925, intercept: -248.83, r2: 0.6581 },
    outputTokensToLatencyMs: { slope: 16.454162, intercept: -1497.68, r2: 0.9675 },
    model: "claude-sonnet-4-6",
  },
  // Endpoints without data — conservative estimates, r2: 0 forces mean fallback
  "edit/inline": {
    n: 0,
    meanOutputTokens: 500,
    stddevOutputTokens: 300,
    meanLatencyMs: 10000,
    stddevLatencyMs: 5000,
    inputTokensToOutputTokens: { slope: 0, intercept: 500, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "edit/whole": {
    n: 0,
    meanOutputTokens: 1500,
    stddevOutputTokens: 800,
    meanLatencyMs: 20000,
    stddevLatencyMs: 10000,
    inputTokensToOutputTokens: { slope: 0, intercept: 1500, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "refine/context": {
    n: 0,
    meanOutputTokens: 800,
    stddevOutputTokens: 400,
    meanLatencyMs: 15000,
    stddevLatencyMs: 7000,
    inputTokensToOutputTokens: { slope: 0, intercept: 800, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "explanation/lean-error": {
    n: 0,
    meanOutputTokens: 600,
    stddevOutputTokens: 300,
    meanLatencyMs: 12000,
    stddevLatencyMs: 5000,
    inputTokensToOutputTokens: { slope: 0, intercept: 600, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "formalization/causal-graph": {
    n: 0,
    meanOutputTokens: 2000,
    stddevOutputTokens: 1000,
    meanLatencyMs: 30000,
    stddevLatencyMs: 15000,
    inputTokensToOutputTokens: { slope: 0, intercept: 2000, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "formalization/dialectical-map": {
    n: 0,
    meanOutputTokens: 2000,
    stddevOutputTokens: 1000,
    meanLatencyMs: 30000,
    stddevLatencyMs: 15000,
    inputTokensToOutputTokens: { slope: 0, intercept: 2000, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "formalization/property-tests": {
    n: 0,
    meanOutputTokens: 1500,
    stddevOutputTokens: 800,
    meanLatencyMs: 25000,
    stddevLatencyMs: 12000,
    inputTokensToOutputTokens: { slope: 0, intercept: 1500, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "formalization/statistical-model": {
    n: 0,
    meanOutputTokens: 1500,
    stddevOutputTokens: 800,
    meanLatencyMs: 25000,
    stddevLatencyMs: 12000,
    inputTokensToOutputTokens: { slope: 0, intercept: 1500, r2: 0 },
    outputTokensToLatencyMs: { slope: 12, intercept: 1000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
  "verification/lean": {
    n: 0,
    meanOutputTokens: 0,
    stddevOutputTokens: 0,
    meanLatencyMs: 15000,
    stddevLatencyMs: 10000,
    inputTokensToOutputTokens: { slope: 0, intercept: 0, r2: 0 },
    outputTokensToLatencyMs: { slope: 0, intercept: 15000, r2: 0 },
    model: "claude-sonnet-4-6",
  },
};

// Approximate max output tokens for each endpoint (used as clamp upper bound)
const MAX_OUTPUT_TOKENS: Record<string, number> = {
  "formalization/semiformal": 8192,
  "formalization/lean": 8192,
  "formalization/causal-graph": 8192,
  "formalization/dialectical-map": 8192,
  "formalization/property-tests": 8192,
  "formalization/statistical-model": 8192,
  "decomposition/extract": 8192,
  "edit/inline": 4096,
  "edit/whole": 8192,
  "refine/context": 4096,
  "explanation/lean-error": 4096,
};
const DEFAULT_MAX_OUTPUT = 8192;

/**
 * Predict cost and latency for an LLM call given the endpoint and input size.
 *
 * @param endpoint - API endpoint name (e.g. "formalization/semiformal")
 * @param userContentLength - character count of the user's input text
 */
export function predictCall(endpoint: string, userContentLength: number): CallPrediction {
  const estimatedInputTokens = Math.round(userContentLength / 4);
  const prior = ENDPOINT_PRIORS[endpoint];

  // Unknown endpoint → zeroed prediction
  if (!prior) {
    return {
      endpoint,
      estimatedInputTokens,
      estimatedOutputTokens: 0,
      estimatedCostUsd: 0,
      estimatedLatencyMs: 0,
      lowCostUsd: 0,
      highCostUsd: 0,
      lowLatencyMs: 0,
      highLatencyMs: 0,
      priorDataPoints: 0,
    };
  }

  const maxOut = MAX_OUTPUT_TOKENS[endpoint] ?? DEFAULT_MAX_OUTPUT;

  // Step 1: Estimate output tokens
  const useRegression = prior.inputTokensToOutputTokens.r2 >= 0.3 && prior.n >= 3;
  let estimatedOutputTokens: number;
  if (useRegression) {
    const reg = prior.inputTokensToOutputTokens;
    estimatedOutputTokens = reg.slope * estimatedInputTokens + reg.intercept;
  } else {
    estimatedOutputTokens = prior.meanOutputTokens;
  }
  estimatedOutputTokens = Math.round(Math.max(50, Math.min(maxOut, estimatedOutputTokens)));

  // Step 2: Output interval (±1 stddev, clamped)
  const lowOutput = Math.round(Math.max(50, estimatedOutputTokens - prior.stddevOutputTokens));
  const highOutput = Math.round(Math.min(maxOut, estimatedOutputTokens + prior.stddevOutputTokens));

  // Step 3: Latency from outputTokens → latencyMs regression
  const latReg = prior.outputTokensToLatencyMs;
  const estimatedLatencyMs = Math.max(0, Math.round(latReg.slope * estimatedOutputTokens + latReg.intercept));
  const lowLatencyMs = Math.max(0, Math.round(latReg.slope * lowOutput + latReg.intercept));
  const highLatencyMs = Math.max(0, Math.round(latReg.slope * highOutput + latReg.intercept));

  // Step 4: Cost from computeCost
  const estimatedCostUsd = computeCost(prior.model, estimatedInputTokens, estimatedOutputTokens);
  const lowCostUsd = computeCost(prior.model, estimatedInputTokens, lowOutput);
  const highCostUsd = computeCost(prior.model, estimatedInputTokens, highOutput);

  return {
    endpoint,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd,
    estimatedLatencyMs,
    lowCostUsd,
    highCostUsd,
    lowLatencyMs,
    highLatencyMs,
    priorDataPoints: prior.n,
  };
}
