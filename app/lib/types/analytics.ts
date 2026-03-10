export type LinearRegression = {
  slope: number;
  intercept: number;
  r2: number;
};

export type EndpointPrior = {
  n: number;
  meanOutputTokens: number;
  stddevOutputTokens: number;
  meanLatencyMs: number;
  stddevLatencyMs: number;
  inputTokensToOutputTokens: LinearRegression;
  outputTokensToLatencyMs: LinearRegression;
  model: string;
};

export type LlmUsage = {
  endpoint: string;
  model: string;
  provider: "anthropic" | "openrouter" | "mock" | "cache";
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  timestamp: string; // ISO
};

export type AnalyticsEntry = LlmUsage & { id: string };

export type AnalyticsSummary = {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
};

export type CallPrediction = {
  endpoint: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  lowCostUsd: number;
  highCostUsd: number;
  lowLatencyMs: number;
  highLatencyMs: number;
  priorDataPoints: number;
};
