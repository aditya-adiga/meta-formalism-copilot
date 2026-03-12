"use client";

import { useEffect, useMemo, useReducer } from "react";

type LoadingPhase = "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying" | "iterating";

/**
 * Hardcoded latency priors extracted from analytics data (47 data points, 2026-02-26).
 * Re-extracted via scripts/analyze-analytics.mjs when enough new data accumulates.
 */
type LatencyPrior = {
  n: number;
  meanOutputTokens: number;
  inputToOutput: { slope: number; intercept: number; r2: number };
  outputToLatency: { slope: number; intercept: number };
};

const LATENCY_PRIORS: Record<string, LatencyPrior> = {
  "formalization/semiformal": {
    n: 10,
    meanOutputTokens: 2299,
    inputToOutput: { slope: 0.037133, intercept: 2211.16, r2: 0.0135 },
    outputToLatency: { slope: 21.253476, intercept: -5038.24 },
  },
  "formalization/lean": {
    n: 32,
    meanOutputTokens: 2687,
    inputToOutput: { slope: 0.336795, intercept: 713.78, r2: 0.6514 },
    outputToLatency: { slope: 10.819042, intercept: 3328.33 },
  },
};

function phaseToEndpoint(phase: LoadingPhase): string | null {
  switch (phase) {
    case "semiformal":
      return "formalization/semiformal";
    case "lean":
    case "retrying":
    case "iterating":
      return "formalization/lean";
    case "verifying":
    case "reverifying":
    case "idle":
      return null;
  }
}

function predictLatencyMs(endpoint: string, inputCharCount: number): number {
  const prior = LATENCY_PRIORS[endpoint];
  if (!prior) return 0;

  const estimatedInputTokens = Math.round(inputCharCount / 4);
  const useRegression = prior.inputToOutput.r2 >= 0.3 && prior.n >= 3;
  let outputTokens: number;
  if (useRegression) {
    outputTokens = prior.inputToOutput.slope * estimatedInputTokens + prior.inputToOutput.intercept;
  } else {
    outputTokens = prior.meanOutputTokens;
  }
  outputTokens = Math.round(Math.max(50, Math.min(8192, outputTokens)));

  return Math.max(0, Math.round(prior.outputToLatency.slope * outputTokens + prior.outputToLatency.intercept));
}

export type WaitTimeEstimate = {
  estimatedMs: number;
  elapsedMs: number;
  remainingMs: number;
  /** Human-readable label like "~25s" or "~1m 10s" */
  remainingLabel: string;
  /** 0–1 progress fraction */
  progress: number;
};

function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `~${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
}

type TimerAction = { type: "tick" } | { type: "reset" };

function timerReducer(seconds: number, action: TimerAction): number {
  switch (action.type) {
    case "tick":
      return seconds + 1;
    case "reset":
      return 0;
  }
}

/**
 * Tracks estimated wait time for the current loading phase.
 * Returns null when idle or when prediction is too short to display.
 *
 * Uses a reducer for the seconds counter so dispatch calls in effects
 * are lint-safe (dispatches are allowed, unlike setState).
 */
export function useWaitTimeEstimate(
  loadingPhase: LoadingPhase,
  inputCharCount: number,
): WaitTimeEstimate | null {
  const [elapsedSeconds, dispatch] = useReducer(timerReducer, 0);

  const endpoint = phaseToEndpoint(loadingPhase);
  const estimatedMs = endpoint ? predictLatencyMs(endpoint, inputCharCount) : 0;
  const isActive = endpoint !== null && estimatedMs >= 3000;

  // Reset counter and start ticking when phase changes
  useEffect(() => {
    dispatch({ type: "reset" });

    if (!isActive) return;

    const id = setInterval(() => {
      dispatch({ type: "tick" });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, loadingPhase]);

  // Derive the estimate purely from elapsedSeconds
  return useMemo(() => {
    if (!isActive) return null;

    const elapsedMs = elapsedSeconds * 1000;
    const remaining = Math.max(0, estimatedMs - elapsedMs);

    return {
      estimatedMs,
      elapsedMs,
      remainingMs: remaining,
      remainingLabel: remaining > 0 ? formatMs(remaining) : "any moment...",
      progress: Math.min(elapsedMs / estimatedMs, 1),
    };
  }, [isActive, elapsedSeconds, estimatedMs]);
}
