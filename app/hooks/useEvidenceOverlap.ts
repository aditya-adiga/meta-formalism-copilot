"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEvidenceStore } from "@/app/lib/stores/evidenceStore";
import { fetchApi } from "@/app/lib/formalization/api";
import {
  serializeTargetKey,
  REVIEW_STUDY_TYPES,
  type EvidenceArtifactType,
  type EvidenceOverlapResponse,
} from "@/app/lib/types/evidence";

/**
 * Hook for analyzing overlap between review papers and individual studies
 * in an evidence slot.
 *
 * Only meaningful after papers have been scored (Phase 2), since overlap
 * detection needs studyType to identify reviews. Returns early if the
 * slot has no review-type papers.
 */
export function useEvidenceOverlap(
  artifactType: EvidenceArtifactType,
  elementId: string,
) {
  const key = serializeTargetKey({ artifactType, elementId });
  const { slot, overlap, isAnalyzing, error } = useEvidenceStore(
    useShallow((s) => ({
      slot: s.slots[key],
      overlap: s.overlap[key] ?? null,
      isAnalyzing: s.analyzing[key] ?? false,
      error: s.errors[key] ?? null,
    })),
  );

  // Check whether the slot has any review-type papers (only meaningful when scored)
  const hasReviews =
    slot?.scored === true &&
    slot.papers.some(
      (p) =>
        p.reliability?.studyType &&
        (REVIEW_STUDY_TYPES as readonly string[]).includes(p.reliability.studyType),
    );

  const analyze = useCallback(async () => {
    const { setAnalyzing, applyOverlap, setError } = useEvidenceStore.getState();
    const currentSlot = useEvidenceStore.getState().slots[key];
    if (!currentSlot || !currentSlot.scored || currentSlot.papers.length === 0) return;
    // Guard against concurrent calls
    if (useEvidenceStore.getState().analyzing[key]) return;

    setAnalyzing(key, true);
    setError(key, null);
    try {
      const result = await fetchApi<EvidenceOverlapResponse>(
        "/api/evidence-overlap",
        {
          papers: currentSlot.papers.map((p) => ({
            openAlexId: p.openAlexId,
            title: p.title,
            year: p.year,
            abstract: p.abstract,
            reliability: p.reliability,
          })),
        },
      );
      applyOverlap(key, result.analysis);
    } catch (err) {
      console.error("[useEvidenceOverlap]", err);
      const message = err instanceof Error ? err.message : "Overlap analysis failed";
      setError(key, message);
    } finally {
      useEvidenceStore.getState().setAnalyzing(key, false);
    }
  }, [key]);

  const hasOverlap = overlap !== null;

  return { slot, overlap, isAnalyzing, error, analyze, hasOverlap, hasReviews };
}
