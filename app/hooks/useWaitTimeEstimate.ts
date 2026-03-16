"use client";

import { useEffect, useMemo, useReducer } from "react";
import { predictCall } from "@/app/lib/llm/predict";

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
 * Tracks estimated wait time for an active LLM call.
 * Returns null when no endpoint is active or when prediction is too short to display.
 *
 * @param activeEndpoint - The API endpoint currently loading (e.g. "formalization/semiformal"),
 *   or null when idle. Uses ENDPOINT_PRIORS from predict.ts for latency estimation.
 * @param inputCharCount - Character count of the input text being processed.
 *
 * Uses a reducer for the seconds counter so dispatch calls in effects
 * are lint-safe (dispatches are allowed, unlike setState).
 */
export function useWaitTimeEstimate(
  activeEndpoint: string | null,
  inputCharCount: number,
): WaitTimeEstimate | null {
  const [elapsedSeconds, dispatch] = useReducer(timerReducer, 0);

  const estimatedMs = activeEndpoint
    ? predictCall(activeEndpoint, inputCharCount).estimatedLatencyMs
    : 0;
  const isActive = activeEndpoint !== null && estimatedMs >= 3000;

  // Reset counter and start ticking when endpoint changes
  useEffect(() => {
    dispatch({ type: "reset" });

    if (!isActive) return;

    const id = setInterval(() => {
      dispatch({ type: "tick" });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, activeEndpoint]);

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
