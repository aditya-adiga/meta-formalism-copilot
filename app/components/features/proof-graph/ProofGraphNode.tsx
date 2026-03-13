import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import type { PropositionNode, NodeVerificationStatus } from "@/app/lib/types/decomposition";

const STATUS_COLORS: Record<NodeVerificationStatus, string> = {
  unverified: "var(--status-unverified)",
  "in-progress": "var(--status-in-progress)",
  verified: "var(--status-verified)",
  failed: "var(--status-failed)",
};

const KIND_BADGE_COLORS: Record<string, string> = {
  // Mathematical
  definition: "#7C3AED",
  axiom: "#7C3AED",
  lemma: "#2563EB",
  proposition: "#2563EB",
  theorem: "#DC2626",
  corollary: "#D97706",
  // Argumentative
  claim: "#DC2626",
  evidence: "#059669",
  assumption: "#D97706",
  objection: "#E11D48",
  rebuttal: "#0891B2",
  // Structural
  question: "#6366F1",
  observation: "#059669",
  narrative: "#6B6560",
  methodology: "#0891B2",
  conclusion: "#7C3AED",
};

// Extended data type that includes injected source color
type ProofGraphNodeData = PropositionNode & { sourceColor?: string };

function ProofGraphNode({ data }: NodeProps<ProofGraphNodeData>) {
  const statusColor = STATUS_COLORS[data.verificationStatus];
  const badgeColor = KIND_BADGE_COLORS[data.kind] ?? "#6B6560";

  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow-md"
      style={{ borderColor: statusColor, borderWidth: 2, minWidth: 160 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#9A9590]" />

      <div className="flex items-center gap-1.5">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {data.kind}
        </span>
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor }}
          title={data.verificationStatus}
        />
      </div>

      <span className="mt-1 text-center text-xs font-semibold text-[var(--ink-black)]">
        {data.label}
      </span>

      {data.sourceLabel && data.sourceColor && (
        <span
          className="mt-0.5 text-center text-[9px] font-medium"
          style={{ color: data.sourceColor }}
        >
          {data.sourceLabel}
        </span>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-[#9A9590]" />
    </div>
  );
}

export default memo(ProofGraphNode);
