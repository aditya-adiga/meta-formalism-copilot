"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEvidenceStore } from "@/app/lib/stores/evidenceStore";
import { fetchApi } from "@/app/lib/formalization/api";
import {
  serializeTargetKey,
  type EvidenceArtifactType,
  type EvidenceScoreResponse,
} from "@/app/lib/types/evidence";

/**
 * Hook for scoring evidence papers in a specific slot.
 *
 * Triggers LLM-based reliability and relatedness scoring for all papers
 * in the slot, then applies scores back to the store. Scoring is separate
 * from search so users can choose when to spend LLM tokens on assessment.
 */
export function useEvidenceScoring(
  artifactType: EvidenceArtifactType,
  elementId: string,
) {
  const key = serializeTargetKey({ artifactType, elementId });
  const { slot, isScoring, error } = useEvidenceStore(
    useShallow((s) => ({
      slot: s.slots[key],
      isScoring: s.scoring[key] ?? false,
      error: s.errors[key] ?? null,
    })),
  );

  const score = useCallback(
    async (claimContent: string) => {
      const { setScoring, applyScores, setError } = useEvidenceStore.getState();
      const currentSlot = useEvidenceStore.getState().slots[key];
      if (!currentSlot || currentSlot.papers.length === 0) return;
      // Guard against concurrent scoring calls (e.g. double-click)
      if (useEvidenceStore.getState().scoring[key]) return;

      setScoring(key, true);
      setError(key, null);
      try {
        const result = await fetchApi<EvidenceScoreResponse>(
          "/api/evidence-score",
          {
            claimContent,
            papers: currentSlot.papers.map((p) => ({
              openAlexId: p.openAlexId,
              title: p.title,
              authors: p.authors,
              year: p.year,
              abstract: p.abstract,
              journal: p.journal,
            })),
          },
        );
        applyScores(key, result.scores);
      } catch (err) {
        console.error("[useEvidenceScoring]", err);
        const message = err instanceof Error ? err.message : "Scoring failed";
        setError(key, message);
      } finally {
        useEvidenceStore.getState().setScoring(key, false);
      }
    },
    [key],
  );

  const hasScores = slot?.scored ?? false;

  return { slot, isScoring, error, score, hasScores };
}
