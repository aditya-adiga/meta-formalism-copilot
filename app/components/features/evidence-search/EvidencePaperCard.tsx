"use client";

import { useState } from "react";
import type { EvidencePaper, PaperOverlapStatus } from "@/app/lib/types/evidence";
import { STUDY_TYPE_LABELS } from "@/app/lib/types/evidence";
import EvidenceScoreBadge from "./EvidenceScoreBadge";

const ABSTRACT_TRUNCATE = 200;

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function paperUrl(paper: EvidencePaper): string | null {
  if (paper.oaUrl) return paper.oaUrl;
  if (paper.doi) return paper.doi.startsWith("http") ? paper.doi : `https://doi.org/${paper.doi}`;
  return null;
}

const OVERLAP_BADGE_STYLES: Record<Exclude<PaperOverlapStatus, "no-reviews">, { label: string; className: string }> = {
  review: { label: "Review paper", className: "text-blue-700 bg-blue-50 border-blue-200" },
  subsumed: { label: "Included in review", className: "text-amber-700 bg-amber-50 border-amber-200" },
  novel: { label: "Novel", className: "text-green-700 bg-green-50 border-green-200" },
};

export default function EvidencePaperCard({
  paper,
  overlapStatus,
  subsumingReviewTitle,
}: {
  paper: EvidencePaper;
  overlapStatus?: PaperOverlapStatus;
  subsumingReviewTitle?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const url = paperUrl(paper);
  const needsTruncation = paper.abstract && paper.abstract.length > ABSTRACT_TRUNCATE;

  return (
    <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-[var(--ink-black)]">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {paper.title}
            </a>
          ) : (
            paper.title
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {paper.reliability && (
            <EvidenceScoreBadge
              label="Rel"
              score={paper.reliability.score}
              tooltip={`Reliability: ${paper.reliability.rationale}`}
            />
          )}
          {paper.relatedness && (
            <EvidenceScoreBadge
              label="Fit"
              score={paper.relatedness.score}
              tooltip={`Relatedness: ${paper.relatedness.rationale}`}
            />
          )}
          {overlapStatus && overlapStatus !== "no-reviews" && (
            <span
              className={`inline-flex items-center rounded border px-1 py-0.5 text-[10px] font-mono cursor-default ${OVERLAP_BADGE_STYLES[overlapStatus].className}`}
              title={
                overlapStatus === "subsumed" && subsumingReviewTitle
                  ? `Included in: ${subsumingReviewTitle}`
                  : undefined
              }
            >
              {OVERLAP_BADGE_STYLES[overlapStatus].label}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#6B6560]">
        <span>{formatAuthors(paper.authors)}</span>
        {paper.year && <span>({paper.year})</span>}
        {paper.journal && <span className="text-[#9A9590]">{paper.journal}</span>}
        {paper.citedByCount > 0 && (
          <span className="rounded bg-[#F5F1ED] px-1.5 py-0.5 text-[10px] font-mono text-[#6B6560]">
            {paper.citedByCount} cited
          </span>
        )}
        {paper.reliability && (
          <span className="rounded bg-[#E8E4E0] px-1.5 py-0.5 text-[10px] font-mono text-[#6B6560]">
            {STUDY_TYPE_LABELS[paper.reliability.studyType]}
          </span>
        )}
      </div>

      {/* Subsuming review detail */}
      {overlapStatus === "subsumed" && subsumingReviewTitle && (
        <div className="text-[10px] text-[#9A9590] mt-0.5">
          Covered by: {subsumingReviewTitle}
        </div>
      )}

      {/* Red flags */}
      {paper.reliability && paper.reliability.redFlags.length > 0 && (
        <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
          {paper.reliability.redFlags.map((flag, i) => (
            <div key={i}>&#9888; {flag}</div>
          ))}
        </div>
      )}

      {paper.abstract && (
        <div className="text-xs text-[#6B6560] leading-relaxed mt-1">
          {expanded || !needsTruncation
            ? paper.abstract
            : `${paper.abstract.slice(0, ABSTRACT_TRUNCATE)}...`}
          {needsTruncation && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-[var(--ink-black)] font-medium hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
