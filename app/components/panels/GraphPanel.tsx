"use client";

import dynamic from "next/dynamic";
import type { PropositionNode } from "@/app/lib/types/decomposition";

// Dynamic import to avoid SSR issues with ReactFlow
const ProofGraph = dynamic(
  () => import("@/app/components/features/proof-graph/ProofGraph"),
  { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590]">Loading graph...</div> },
);

type GraphPanelProps = {
  propositions: PropositionNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  paperText: string;
  extractionStatus: "idle" | "extracting" | "done" | "error";
  onDecompose: () => void;
};

export default function GraphPanel({
  propositions,
  selectedNodeId,
  onSelectNode,
  paperText,
  extractionStatus,
  onDecompose,
}: GraphPanelProps) {
  const hasText = paperText.trim().length > 0;
  const hasNodes = propositions.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
          Proof Graph
        </h2>
        {hasText && (
          <button
            onClick={onDecompose}
            disabled={extractionStatus === "extracting"}
            className="rounded-full bg-[var(--ink-black)] px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
          >
            {extractionStatus === "extracting" ? "Decomposing..." : "Decompose Paper"}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!hasText && (
          <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590]">
            Upload a paper in the Source panel first
          </div>
        )}

        {hasText && !hasNodes && extractionStatus !== "extracting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[#9A9590]">
            <p>Click &quot;Decompose Paper&quot; to extract propositions</p>
            {extractionStatus === "error" && (
              <p className="text-red-600">Extraction failed. Try again.</p>
            )}
          </div>
        )}

        {extractionStatus === "extracting" && !hasNodes && (
          <div className="flex flex-1 items-center justify-center text-sm text-[#6B6560]">
            Extracting propositions...
          </div>
        )}

        {hasNodes && (
          <ProofGraph
            propositions={propositions}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        )}
      </div>
    </div>
  );
}
