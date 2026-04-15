"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useEvidenceStore } from "@/app/lib/stores/evidenceStore";
import { fetchApi } from "@/app/lib/formalization/api";
import {
  MAX_INTEGRATION_PAPERS,
  serializeTargetKey,
  type EvidenceArtifactType,
  type EvidenceIntegrateResponse,
  type IntegrationProposal,
} from "@/app/lib/types/evidence";

/**
 * Hook for generating and managing evidence-based integration proposals.
 *
 * Takes scored papers and the current artifact content, asks the LLM to
 * propose specific field edits, and manages approve/reject decisions.
 * The actual application of approved edits is handled by the parent
 * component via applyProposals + onContentChange.
 */
export function useEvidenceIntegration(
  artifactType: EvidenceArtifactType,
  elementId: string,
) {
  const key = serializeTargetKey({ artifactType, elementId });
  const { slot, proposals, isIntegrating, error } = useEvidenceStore(
    useShallow((s) => ({
      slot: s.slots[key],
      proposals: s.proposals[key] ?? [],
      isIntegrating: s.integrating[key] ?? false,
      error: s.errors[key] ?? null,
    })),
  );

  const integrate = useCallback(
    async (artifactContent: string) => {
      const { setIntegrating, setProposals, setError } = useEvidenceStore.getState();
      const currentSlot = useEvidenceStore.getState().slots[key];
      if (!currentSlot || !currentSlot.scored || currentSlot.papers.length === 0) return;
      // Guard against concurrent calls
      if (useEvidenceStore.getState().integrating[key]) return;

      setIntegrating(key, true);
      setError(key, null);
      try {
        // Send top papers by combined score, excluding subsumed papers
        const overlap = useEvidenceStore.getState().overlap[key];
        const eligiblePapers = currentSlot.papers.filter((p) => {
          if (!p.reliability || !p.relatedness) return false;
          if (overlap?.paperStatus[p.openAlexId] === "subsumed") return false;
          return true;
        });

        const sorted = [...eligiblePapers].sort((a, b) => {
          const scoreA = (a.reliability?.score ?? 0) + (a.relatedness?.score ?? 0);
          const scoreB = (b.reliability?.score ?? 0) + (b.relatedness?.score ?? 0);
          return scoreB - scoreA;
        });

        const topPapers = sorted.slice(0, MAX_INTEGRATION_PAPERS).map((p) => ({
          openAlexId: p.openAlexId,
          title: p.title,
          authors: p.authors,
          year: p.year,
          abstract: p.abstract,
          reliability: p.reliability,
          relatedness: p.relatedness,
        }));

        if (topPapers.length === 0) return;

        const result = await fetchApi<EvidenceIntegrateResponse>(
          "/api/evidence-integrate",
          {
            artifactType,
            artifactContent,
            papers: topPapers,
          },
        );

        // Add client-side IDs and pending decisions
        const withIds: IntegrationProposal[] = result.proposals.map((p) => ({
          ...p,
          id: crypto.randomUUID(),
          decision: null,
        }));

        setProposals(key, withIds);
      } catch (err) {
        console.error("[useEvidenceIntegration]", err);
        const message = err instanceof Error ? err.message : "Integration failed";
        setError(key, message);
      } finally {
        useEvidenceStore.getState().setIntegrating(key, false);
      }
    },
    [key, artifactType],
  );

  const setDecision = useCallback(
    (proposalId: string, decision: boolean) => {
      useEvidenceStore.getState().setProposalDecision(key, proposalId, decision);
    },
    [key],
  );

  const clearProposals = useCallback(() => {
    useEvidenceStore.getState().clearProposals(key);
  }, [key]);

  return {
    proposals,
    isIntegrating,
    error,
    integrate,
    setDecision,
    clearProposals,
    hasProposals: proposals.length > 0,
    canIntegrate: (slot?.scored ?? false) && !isIntegrating,
  };
}
