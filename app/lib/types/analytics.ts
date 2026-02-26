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
