"use client";

import { useEvidenceSearch } from "@/app/hooks/useEvidenceSearch";
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
  const { slot, isLoading, search } = useEvidenceSearch(artifactType, elementId);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        disabled={isLoading}
        onClick={() => search(elementContent, contextSummary)}
        className="text-xs text-[#6B6560] hover:text-[var(--ink-black)] disabled:opacity-50 disabled:cursor-wait"
      >
        {isLoading
          ? "Searching..."
          : slot
            ? "Refresh evidence"
            : "Find evidence"}
      </button>

      {slot && <EvidenceResultsSection slot={slot} />}
    </div>
  );
}
