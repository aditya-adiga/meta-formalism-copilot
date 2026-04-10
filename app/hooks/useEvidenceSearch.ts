"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEvidenceStore } from "@/app/lib/stores/evidenceStore";
import { fetchApi } from "@/app/lib/formalization/api";
import {
  serializeTargetKey,
  type EvidenceArtifactType,
  type EvidenceSearchResponse,
} from "@/app/lib/types/evidence";

/**
 * Hook for searching evidence for a specific artifact element.
 *
 * Reads from and writes to the evidence store. Returns the current
 * evidence slot (if any), loading state, and a search function.
 */
export function useEvidenceSearch(
  artifactType: EvidenceArtifactType,
  elementId: string,
) {
  const key = serializeTargetKey({ artifactType, elementId });
  const { slot, isLoading, error } = useEvidenceStore(
    useShallow((s) => ({
      slot: s.slots[key],
      isLoading: s.loading[key] ?? false,
      error: s.errors[key] ?? null,
    })),
  );

  const search = useCallback(
    async (elementContent: string, contextSummary?: string) => {
      const { setLoading, setEvidence, setError } = useEvidenceStore.getState();
      setLoading(key, true);
      setError(key, null);
      try {
        const result = await fetchApi<EvidenceSearchResponse>(
          "/api/evidence-search",
          { artifactType, elementId, elementContent, contextSummary },
        );
        setEvidence(key, {
          targetKey: { artifactType, elementId },
          searchQueries: result.queries,
          papers: result.papers,
          searchedAt: new Date().toISOString(),
          reliability: null,
          relatedness: null,
        });
      } catch (err) {
        console.error("[useEvidenceSearch]", err);
        const message = err instanceof Error ? err.message : "Evidence search failed";
        setError(key, message);
      } finally {
        useEvidenceStore.getState().setLoading(key, false);
      }
    },
    [artifactType, elementId, key],
  );

  return { slot, isLoading, error, search };
}
