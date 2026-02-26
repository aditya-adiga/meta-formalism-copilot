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
