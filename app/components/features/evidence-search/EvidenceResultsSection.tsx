"use client";

import { useMemo, useState } from "react";
import type { EvidencePaper, EvidenceSlot, OverlapAnalysis } from "@/app/lib/types/evidence";
import EvidencePaperCard from "./EvidencePaperCard";
import OverlapSummary from "./OverlapSummary";

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
  /** Callback to trigger overlap analysis — rendered as button if provided */
  onAnalyzeOverlap?: () => void;
  /** Whether overlap analysis is currently in progress */
  isAnalyzing?: boolean;
  /** Overlap analysis results (null if not yet analyzed) */
  overlap?: OverlapAnalysis | null;
  /** Whether the slot has review-type papers (controls button visibility) */
  hasReviews?: boolean;
};

export default function EvidenceResultsSection({
  slot,
  onScore,
  isScoring,
  onAnalyzeOverlap,
  isAnalyzing,
  overlap,
  hasReviews,
}: EvidenceResultsSectionProps) {
  const [open, setOpen] = useState(true);
  const count = slot.papers.length;

  const displayPapers = useMemo(() => {
    if (slot.scored) return sortByScore(slot.papers);
    return slot.papers;
  }, [slot.papers, slot.scored]);

  // Pre-build a lookup from studyId → subsuming review title (avoids O(R*P) per render)
  const subsumingReviewTitles = useMemo(() => {
    if (!overlap) return new Map<string, string>();
    const titleById = new Map(slot.papers.map((p) => [p.openAlexId, p.title]));
    const result = new Map<string, string>();
    for (const rel of overlap.relations) {
      if (!result.has(rel.studyId)) {
        const title = titleById.get(rel.reviewId);
        if (title) result.set(rel.studyId, title);
      }
    }
    return result;
  }, [overlap, slot.papers]);

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

        <div className="flex items-center gap-1">
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

          {onAnalyzeOverlap && slot.scored && hasReviews && (
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={onAnalyzeOverlap}
              className="text-[10px] text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded px-1.5 py-0.5 hover:bg-[#F5F1ED] disabled:opacity-50 disabled:cursor-wait"
            >
              {isAnalyzing
                ? "Analyzing..."
                : overlap
                  ? "Re-analyze overlap"
                  : "Check overlap"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {count === 0 && (
            <p className="text-xs text-[#9A9590]">
              No relevant papers were found. Try editing the element content for more specific terms.
            </p>
          )}

          {overlap && <OverlapSummary analysis={overlap} />}

          {displayPapers.map((paper) => (
            <EvidencePaperCard
              key={paper.openAlexId}
              paper={paper}
              overlapStatus={overlap?.paperStatus[paper.openAlexId]}
              subsumingReviewTitle={subsumingReviewTitles.get(paper.openAlexId)}
            />
          ))}

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
