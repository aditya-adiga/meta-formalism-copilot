"use client";

import { useEvidenceSearch } from "@/app/hooks/useEvidenceSearch";
import { useEvidenceScoring } from "@/app/hooks/useEvidenceScoring";
import EvidenceResultsSection from "./EvidenceResultsSection";
import type { EvidenceArtifactType } from "@/app/lib/types/evidence";

type FindEvidenceButtonProps = {
  artifactType: EvidenceArtifactType;
  elementId: string;
  elementContent: string;
  contextSummary?: string;
};

export default function FindEvidenceButton({
  artifactType,
  elementId,
  elementContent,
  contextSummary,
}: FindEvidenceButtonProps) {
  const { slot, isLoading, error, search } = useEvidenceSearch(artifactType, elementId);
  const { isScoring, score } = useEvidenceScoring(artifactType, elementId);

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
        />
      )}
    </div>
  );
}
