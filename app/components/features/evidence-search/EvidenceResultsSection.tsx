"use client";

import { useMemo, useState } from "react";
import type { EvidencePaper, EvidenceSlot } from "@/app/lib/types/evidence";
import EvidencePaperCard from "./EvidencePaperCard";

/** Sort papers by combined score (reliability + relatedness) descending.
 *  Unscored papers sort to the end. */
function sortByScore(papers: EvidencePaper[]): EvidencePaper[] {
  return [...papers].sort((a, b) => {
    const scoreA = (a.reliability?.score ?? -1) + (a.relatedness?.score ?? -1);
    const scoreB = (b.reliability?.score ?? -1) + (b.relatedness?.score ?? -1);
    return scoreB - scoreA;
  });
}

type EvidenceResultsSectionProps = {
  slot: EvidenceSlot;
  /** Callback to trigger scoring — rendered as button if provided */
  onScore?: () => void;
  /** Whether scoring is currently in progress */
  isScoring?: boolean;
};

export default function EvidenceResultsSection({
  slot,
  onScore,
  isScoring,
}: EvidenceResultsSectionProps) {
  const [open, setOpen] = useState(true);
  const count = slot.papers.length;

  // Sort papers by score when scores are available
  const displayPapers = useMemo(() => {
    if (slot.scored) return sortByScore(slot.papers);
    return slot.papers;
  }, [slot.papers, slot.scored]);

  return (
    <div className="mt-2 border-t border-[#DDD9D5] pt-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs font-medium text-[#6B6560] hover:text-[var(--ink-black)]"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          {count === 0
            ? "No papers found"
            : `${count} paper${count === 1 ? "" : "s"} found`}
          {slot.scored && (
            <span className="text-[10px] text-[#9A9590] ml-1">(scored)</span>
          )}
        </button>

        {/* Score button — only show when there are papers and scoring is available */}
        {onScore && count > 0 && (
          <button
            type="button"
            disabled={isScoring}
            onClick={onScore}
            className="text-[10px] text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded px-1.5 py-0.5 hover:bg-[#F5F1ED] disabled:opacity-50 disabled:cursor-wait"
          >
            {isScoring
              ? "Scoring..."
              : slot.scored
                ? "Re-score"
                : "Score papers"}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {count === 0 && (
            <p className="text-xs text-[#9A9590]">
              No relevant papers were found. Try editing the element content for more specific terms.
            </p>
          )}

          {displayPapers.map((paper) => (
            <EvidencePaperCard key={paper.openAlexId} paper={paper} />
          ))}

          {/* Search queries used (muted) */}
          {slot.searchQueries.length > 0 && (
            <div className="text-[10px] text-[#9A9590] mt-1">
              Searched: {slot.searchQueries.join(" | ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
