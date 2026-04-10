"use client";

import { useState } from "react";
import type { EvidenceSlot } from "@/app/lib/types/evidence";
import EvidencePaperCard from "./EvidencePaperCard";

export default function EvidenceResultsSection({ slot }: { slot: EvidenceSlot }) {
  const [open, setOpen] = useState(true);
  const count = slot.papers.length;

  return (
    <div className="mt-2 border-t border-[#DDD9D5] pt-2">
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
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {count === 0 && (
            <p className="text-xs text-[#9A9590]">
              No relevant papers were found. Try editing the element content for more specific terms.
            </p>
          )}

          {slot.papers.map((paper) => (
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
