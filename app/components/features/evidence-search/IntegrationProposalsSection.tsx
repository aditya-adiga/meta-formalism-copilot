"use client";

import { useMemo, useState } from "react";
import type { EvidencePaper, IntegrationProposal } from "@/app/lib/types/evidence";
import IntegrationProposalCard from "./IntegrationProposalCard";

type IntegrationProposalsSectionProps = {
  proposals: IntegrationProposal[];
  papers: EvidencePaper[];
  onSetDecision: (id: string, decision: boolean) => void;
  onApplyApproved: () => void;
};

export default function IntegrationProposalsSection({
  proposals,
  papers,
  onSetDecision,
  onApplyApproved,
}: IntegrationProposalsSectionProps) {
  const [open, setOpen] = useState(true);

  const paperTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of papers) {
      map[p.openAlexId] = p.title;
    }
    return map;
  }, [papers]);

  const pendingCount = proposals.filter((p) => p.decision === null).length;
  const approvedCount = proposals.filter((p) => p.decision === true).length;

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
        {proposals.length} proposed edit{proposals.length === 1 ? "" : "s"}
        {pendingCount > 0 && (
          <span className="text-[10px] text-[#9A9590] ml-1">({pendingCount} pending)</span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {proposals.map((p) => (
            <IntegrationProposalCard
              key={p.id}
              proposal={p}
              paperTitles={paperTitles}
              onApprove={(id) => onSetDecision(id, true)}
              onReject={(id) => onSetDecision(id, false)}
            />
          ))}

          {approvedCount > 0 && (
            <button
              type="button"
              onClick={onApplyApproved}
              className="text-xs font-medium text-white bg-green-700 hover:bg-green-800 rounded px-3 py-1"
            >
              Apply {approvedCount} approved edit{approvedCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
