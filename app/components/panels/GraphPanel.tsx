"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { PropositionNode, SourceDocument } from "@/app/lib/types/decomposition";
import DownloadButton from "@/app/components/ui/DownloadButton";

// Dynamic import to avoid SSR issues with ReactFlow
const ProofGraph = dynamic(
  () => import("@/app/components/features/proof-graph/ProofGraph"),
  { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590]">Loading graph...</div> },
);

const SOURCE_COLORS = [
  "#6366F1", // indigo
  "#0891B2", // cyan
  "#059669", // emerald
  "#D97706", // amber
  "#DC2626", // red
  "#7C3AED", // violet
];

type GraphPanelProps = {
  propositions: PropositionNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  hasContent: boolean;
  sourceDocuments: SourceDocument[];
  extractionStatus: "idle" | "extracting" | "done" | "error";
  onDecompose: () => void;
};

export default function GraphPanel({
  propositions,
  selectedNodeId,
  onSelectNode,
  hasContent,
  sourceDocuments,
  extractionStatus,
  onDecompose,
}: GraphPanelProps) {
  const hasNodes = propositions.length > 0;
  const sourceCount = sourceDocuments.length;
  const [exporting, setExporting] = useState(false);

  const sourceColorMap: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < sourceDocuments.length; i++) {
      map[sourceDocuments[i].sourceId] = SOURCE_COLORS[i % SOURCE_COLORS.length];
    }
    return map;
  }, [sourceDocuments]);

  const buttonLabel = extractionStatus === "extracting"
    ? "Decomposing..."
    : `Decompose ${sourceCount} Source${sourceCount !== 1 ? "s" : ""}`;

  const handleExportGraph = useCallback(async () => {
    setExporting(true);
    try {
      // Dynamic import to avoid loading html-to-image until needed
      const { getGraphViewportElement, downloadGraphAsPng } = await import("@/app/lib/utils/exportGraph");
      const viewport = getGraphViewportElement();
      if (viewport) await downloadGraphAsPng(viewport);
    } catch (err) {
      console.error("[graph export]", err);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
          Proof Graph
        </h2>
        <div className="flex items-center gap-2">
          {hasNodes && (
            <DownloadButton
              label={exporting ? "Exporting..." : "Export .png"}
              onClick={handleExportGraph}
              disabled={exporting}
            />
          )}
          {hasContent && (
            <button
              onClick={onDecompose}
              disabled={extractionStatus === "extracting"}
              className="rounded-full bg-[var(--ink-black)] px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>

      {/* Source color legend — shown when multiple sources and nodes exist */}
      {sourceCount > 1 && hasNodes && (
        <div className="flex flex-wrap gap-3 border-b border-[#DDD9D5] bg-[#F5F1ED]/50 px-6 py-2">
          {sourceDocuments.map((doc) => (
            <div key={doc.sourceId} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: sourceColorMap[doc.sourceId] }}
              />
              <span className="text-[11px] text-[#6B6560]">{doc.sourceLabel}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {!hasContent && (
          <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590]">
            Upload a paper in the Source panel first
          </div>
        )}

        {hasContent && !hasNodes && extractionStatus !== "extracting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[#9A9590]">
            <p>Click &quot;{buttonLabel}&quot; to extract propositions</p>
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
            sourceColorMap={sourceColorMap}
          />
        )}
      </div>
    </div>
  );
}
