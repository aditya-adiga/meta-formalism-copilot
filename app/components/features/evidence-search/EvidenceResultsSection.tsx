"use client";

import { useMemo, useState } from "react";
import { isSlotScored, type EvidencePaper, type EvidenceSlot, type OverlapAnalysis } from "@/app/lib/types/evidence";
import EvidencePaperCard from "./EvidencePaperCard";
import OverlapSummary from "./OverlapSummary";
import EvidenceQueryEditor from "./EvidenceQueryEditor";

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
  /** Re-run search with the edited queries. */
  onRerun: (queries: string[]) => void;
  /** Soft-prune a paper by id. */
  onPrune: (openAlexId: string) => void;
  /** Restore a pruned paper by id. */
  onRestore: (openAlexId: string) => void;
  /** Callback to trigger scoring — rendered as a button if provided. */
  onScore?: () => void;
  /** Whether scoring is currently in progress. */
  isScoring?: boolean;
  /** Callback to trigger overlap analysis — rendered as button if provided */
  onAnalyzeOverlap?: () => void;
  /** Whether overlap analysis is currently in progress */
  isAnalyzing?: boolean;
  /** Overlap analysis results (null if not yet analyzed) */
  overlap?: OverlapAnalysis | null;
  /** Whether the slot has review-type papers (controls button visibility) */
  hasReviews?: boolean;
  /** Whether a search is currently in progress. */
  isLoading?: boolean;
};

export default function EvidenceResultsSection({
  slot,
  onRerun,
  onPrune,
  onRestore,
  onScore,
  isScoring,
  onAnalyzeOverlap,
  isAnalyzing,
  overlap,
  hasReviews,
  isLoading = false,
}: EvidenceResultsSectionProps) {
  const [open, setOpen] = useState(true);
  const [showPruned, setShowPruned] = useState(false);

  const active = useMemo(
    () => slot.papers.filter((p) => p.status !== "pruned"),
    [slot.papers],
  );
  const pruned = useMemo(
    () => slot.papers.filter((p) => p.status === "pruned"),
    [slot.papers],
  );
  const scored = isSlotScored(slot);
  const count = active.length;

  const displayPapers = useMemo(() => {
    if (scored) return sortByScore(active);
    return active;
  }, [active, scored]);

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
          className="flex items-center gap-1 rounded text-xs font-medium text-[#6B6560] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          {count === 0
            ? "No papers found"
            : `${count} paper${count === 1 ? "" : "s"} found`}
          {scored && <span className="text-[10px] text-[#9A9590] ml-1">(scored)</span>}
        </button>

        <div className="flex items-center gap-1">
          {onScore && count > 0 && (
            <button
              type="button"
              disabled={isScoring}
              onClick={onScore}
              className="text-[10px] text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded px-1.5 py-0.5 hover:bg-[#F5F1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30 active:bg-[#ECE7E2] disabled:opacity-50 disabled:cursor-wait"
            >
              {isScoring ? "Scoring..." : scored ? "Re-score" : "Score papers"}
            </button>
          )}

          {onAnalyzeOverlap && scored && hasReviews && (
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={onAnalyzeOverlap}
              className="text-[10px] text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded px-1.5 py-0.5 hover:bg-[#F5F1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30 active:bg-[#ECE7E2] disabled:opacity-50 disabled:cursor-wait"
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
              No relevant papers were found. Edit the queries below and re-run, or refine the element content.
            </p>
          )}

          {overlap && <OverlapSummary analysis={overlap} />}

          {displayPapers.map((paper) => (
            <EvidencePaperCard
              key={paper.openAlexId}
              paper={paper}
              overlapStatus={overlap?.paperStatus[paper.openAlexId]}
              subsumingReviewTitle={subsumingReviewTitles.get(paper.openAlexId)}
              onPrune={() => onPrune(paper.openAlexId)}
              onRestore={() => onRestore(paper.openAlexId)}
            />
          ))}

          {pruned.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowPruned((s) => !s)}
                className="rounded text-[10px] text-[#9A9590] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
              >
                {showPruned ? "Hide" : "Show"} pruned ({pruned.length})
              </button>
              {showPruned && (
                <div className="mt-1 space-y-2">
                  {pruned.map((paper) => (
                    <EvidencePaperCard
                      key={paper.openAlexId}
                      paper={paper}
                      overlapStatus={overlap?.paperStatus[paper.openAlexId]}
                      subsumingReviewTitle={subsumingReviewTitles.get(paper.openAlexId)}
                      onPrune={() => onPrune(paper.openAlexId)}
                      onRestore={() => onRestore(paper.openAlexId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editable search queries (replaces the old read-only line).
              Keyed on searchedAt so the draft re-seeds when a new run (e.g. the
              top-level "Refresh evidence" LLM regeneration) changes the queries. */}
          <EvidenceQueryEditor
            key={slot.searchedAt}
            queries={slot.searchQueries}
            isLoading={isLoading}
            onRerun={onRerun}
          />
        </div>
      )}
    </div>
  );
}
