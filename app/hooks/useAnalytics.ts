"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import type { AnalyticsEntry, AnalyticsSummary } from "@/app/lib/types/analytics";

export function useAnalytics() {
  const [entries, setEntries] = useState<AnalyticsEntry[]>([]);

  // Hydrate from persisted analytics on mount
  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.entries) && data.entries.length > 0) {
          setEntries(data.entries);
        }
      })
      .catch(() => {
        // Persistence unavailable — continue with empty state
      });
  }, []);

  const clearAnalytics = useCallback(() => {
    setEntries([]);
    fetch("/api/analytics", { method: "DELETE" }).catch(() => {
      // Persistence unavailable — local state already cleared
    });
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

  return { entries, summary, clearAnalytics };
}
