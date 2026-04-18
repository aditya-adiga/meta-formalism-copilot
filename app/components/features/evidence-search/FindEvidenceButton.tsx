"use client";

import { useCallback } from "react";
import { useEvidenceSearch } from "@/app/hooks/useEvidenceSearch";
import { useEvidenceScoring } from "@/app/hooks/useEvidenceScoring";
import { useEvidenceOverlap } from "@/app/hooks/useEvidenceOverlap";
import { useEvidenceIntegration } from "@/app/hooks/useEvidenceIntegration";
import { applyProposals } from "@/app/lib/utils/applyProposals";
import EvidenceResultsSection from "./EvidenceResultsSection";
import IntegrationProposalsSection from "./IntegrationProposalsSection";
import type { EvidenceArtifactType } from "@/app/lib/types/evidence";

type FindEvidenceButtonProps = {
  artifactType: EvidenceArtifactType;
  elementId: string;
  elementContent: string;
  contextSummary?: string;
  /** Full artifact content as JSON string (needed for integration proposals) */
  artifactJson?: string;
  /** Callback to apply artifact changes (needed to apply approved proposals) */
  onContentChange?: (json: string) => void;
};

export default function FindEvidenceButton({
  artifactType,
  elementId,
  elementContent,
  contextSummary,
  artifactJson,
  onContentChange,
}: FindEvidenceButtonProps) {
  const { slot, isLoading, error, search } = useEvidenceSearch(artifactType, elementId);
  const { isScoring, score } = useEvidenceScoring(artifactType, elementId);
  const { overlap, isAnalyzing, analyze, hasReviews } = useEvidenceOverlap(artifactType, elementId);
  const {
    proposals, isIntegrating, error: integrationError, integrate, setDecision,
    clearProposals, hasProposals, canIntegrate,
  } = useEvidenceIntegration(artifactType, elementId);

  const canSuggestEdits = canIntegrate && !!artifactJson && !!onContentChange;

  const handleApplyApproved = useCallback(() => {
    if (!artifactJson || !onContentChange || proposals.length === 0) return;
    const updated = applyProposals(artifactJson, proposals);
    onContentChange(updated);
    clearProposals();
  }, [artifactJson, onContentChange, proposals, clearProposals]);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        disabled={isLoading}
        onClick={() => search(elementContent, contextSummary)}
        className="text-xs text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded-md px-2 py-0.5 hover:bg-[#F5F1ED] disabled:opacity-50 disabled:cursor-wait"
      >
        {isLoading
          ? "Searching..."
          : slot
            ? "Refresh evidence"
            : "Find evidence"}
      </button>

      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}

      {slot && (
        <EvidenceResultsSection
          slot={slot}
          onScore={() => score(elementContent)}
          isScoring={isScoring}
          onAnalyzeOverlap={analyze}
          isAnalyzing={isAnalyzing}
          overlap={overlap}
          hasReviews={hasReviews}
        />
      )}

      {slot && canSuggestEdits && (
        <button
          type="button"
          disabled={isIntegrating}
          onClick={() => integrate(artifactJson)}
          className="mt-1.5 text-xs text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded-md px-2 py-0.5 hover:bg-[#F5F1ED] disabled:opacity-50 disabled:cursor-wait"
        >
          {isIntegrating
            ? "Generating suggestions..."
            : hasProposals
              ? "Re-suggest edits"
              : "Suggest edits"}
        </button>
      )}

      {integrationError && (
        <p className="text-xs text-red-600 mt-1">{integrationError}</p>
      )}

      {hasProposals && slot && (
        <IntegrationProposalsSection
          proposals={proposals}
          papers={slot.papers}
          onSetDecision={setDecision}
          onApplyApproved={handleApplyApproved}
        />
      )}
    </div>
  );
}
