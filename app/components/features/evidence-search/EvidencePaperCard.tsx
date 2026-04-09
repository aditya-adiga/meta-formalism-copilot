"use client";

import { useState } from "react";
import type { EvidencePaper } from "@/app/lib/types/evidence";

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

export default function EvidencePaperCard({ paper }: { paper: EvidencePaper }) {
  const [expanded, setExpanded] = useState(false);
  const url = paperUrl(paper);
  const needsTruncation = paper.abstract && paper.abstract.length > ABSTRACT_TRUNCATE;

  return (
    <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-1">
      {/* Title */}
      <div className="text-sm font-medium text-[var(--ink-black)]">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {paper.title}
          </a>
        ) : (
          paper.title
        )}
      </div>

      {/* Authors + meta */}
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#6B6560]">
        <span>{formatAuthors(paper.authors)}</span>
        {paper.year && <span>({paper.year})</span>}
        {paper.journal && <span className="text-[#9A9590]">{paper.journal}</span>}
        {paper.citedByCount > 0 && (
          <span className="rounded bg-[#F5F1ED] px-1.5 py-0.5 text-[10px] font-mono text-[#6B6560]">
            {paper.citedByCount} cited
          </span>
        )}
      </div>

      {/* Abstract */}
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
