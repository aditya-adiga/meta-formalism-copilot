"use client";

import type { IntegrationEditType, IntegrationProposal } from "@/app/lib/types/evidence";

const EDIT_TYPE_STYLES: Record<IntegrationEditType, { label: string; className: string }> = {
  "update-prior": { label: "Update prior", className: "text-blue-700 bg-blue-50 border-blue-200" },
  "add-evidence": { label: "Add evidence", className: "text-green-700 bg-green-50 border-green-200" },
  "flag-contradiction": { label: "Contradiction", className: "text-red-700 bg-red-50 border-red-200" },
  "refine-wording": { label: "Refine wording", className: "text-gray-700 bg-gray-50 border-gray-200" },
};

export default function IntegrationProposalCard({
  proposal,
  paperTitles,
  onApprove,
  onReject,
}: {
  proposal: IntegrationProposal;
  paperTitles: Record<string, string>;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const editStyle = EDIT_TYPE_STYLES[proposal.editType];
  const decided = proposal.decision !== null;

  return (
    <div className={`rounded border px-3 py-2 space-y-2 ${
      proposal.decision === true
        ? "border-green-300 bg-green-50/30"
        : proposal.decision === false
          ? "border-[#DDD9D5] bg-[#F5F1ED]/50 opacity-60"
          : "border-[#DDD9D5] bg-white"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--ink-black)]">
          {proposal.fieldLabel}
        </span>
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono ${editStyle.className}`}>
          {editStyle.label}
        </span>
      </div>

      <div className="space-y-1">
        <div className="rounded bg-red-50 border border-red-200 px-2 py-1">
          <span className="text-[10px] font-mono text-red-500 mr-1">-</span>
          <span className="text-xs text-red-800 line-through">{proposal.currentValue}</span>
        </div>
        <div className="rounded bg-green-50 border border-green-200 px-2 py-1">
          <span className="text-[10px] font-mono text-green-500 mr-1">+</span>
          <span className="text-xs text-green-800">{proposal.proposedValue}</span>
        </div>
      </div>

      <p className="text-xs text-[#6B6560] leading-relaxed">{proposal.rationale}</p>

      {proposal.paperIds.length > 0 && (
        <div className="text-[10px] text-[#9A9590]">
          Based on: {proposal.paperIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              {paperTitles[id] ?? id}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {decided ? (
          <span className={`text-xs font-medium ${
            proposal.decision ? "text-green-700" : "text-[#9A9590]"
          }`}>
            {proposal.decision ? "Approved" : "Rejected"}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onApprove(proposal.id)}
              className="text-[10px] font-medium text-green-700 hover:text-green-900 border border-green-300 rounded px-2 py-0.5 hover:bg-green-50"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onReject(proposal.id)}
              className="text-[10px] font-medium text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded px-2 py-0.5 hover:bg-[#F5F1ED]"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
