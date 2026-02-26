"use client";

import { useState, useCallback, useMemo } from "react";
import type { LlmUsage, AnalyticsEntry, AnalyticsSummary } from "@/app/lib/types/analytics";

let nextId = 1;

export function useAnalytics() {
  const [entries, setEntries] = useState<AnalyticsEntry[]>([]);

  const recordUsage = useCallback((usage: LlmUsage) => {
    setEntries((prev) => [
      ...prev,
      { ...usage, id: String(nextId++) },
    ]);
  }, []);

  const clearAnalytics = useCallback(() => {
    setEntries([]);
  }, []);

  const summary: AnalyticsSummary = useMemo(() => {
    const totalCalls = entries.length;
    const totalInputTokens = entries.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = entries.reduce((s, e) => s + e.outputTokens, 0);
    const totalCostUsd = entries.reduce((s, e) => s + e.costUsd, 0);
    const averageLatencyMs = totalCalls > 0
      ? entries.reduce((s, e) => s + e.latencyMs, 0) / totalCalls
      : 0;
    return { totalCalls, totalInputTokens, totalOutputTokens, totalCostUsd, averageLatencyMs };
  }, [entries]);

  return { entries, summary, recordUsage, clearAnalytics };
}
