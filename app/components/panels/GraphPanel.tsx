"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import type { PropositionNode, SourceDocument, GraphLayout } from "@/app/lib/types/decomposition";
import type { ArtifactType } from "@/app/lib/types/session";
import type { QueueProgress } from "@/app/hooks/useAutoFormalizeQueue";
import { useStreamingMerge } from "@/app/hooks/useStreamingMerge";
import ArtifactChipSelector from "@/app/components/features/artifact-selector/ArtifactChipSelector";
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
  streamingPropositions?: PropositionNode[] | null;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  hasContent: boolean;
  sourceDocuments: SourceDocument[];
  extractionStatus: "idle" | "extracting" | "done" | "error";
  onDecompose: () => void;
  queueProgress: QueueProgress;
  onFormalizeAll: (artifactTypes: ArtifactType[]) => void;
  globalArtifactTypes: ArtifactType[];
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onCancelQueue: () => void;
  graphLayout?: GraphLayout;
  onLayoutChange?: (layout: GraphLayout) => void;
  onAddNode?: () => void;
  onDeleteNode?: (nodeId: string) => void;
  onRenameNode?: (nodeId: string, label: string) => void;
  onConnectNodes?: (fromId: string, toId: string) => boolean;
  onDeleteEdges?: (edges: Array<{ source: string; target: string }>) => void;
};

export default function GraphPanel({
  propositions,
  streamingPropositions,
  selectedNodeId,
  onSelectNode,
  hasContent,
  sourceDocuments,
  extractionStatus,
  onDecompose,
  queueProgress,
  onFormalizeAll,
  globalArtifactTypes,
  onPauseQueue,
  onResumeQueue,
  onCancelQueue,
  graphLayout,
  onLayoutChange,
  onAddNode,
  onDeleteNode,
  onRenameNode,
  onConnectNodes,
  onDeleteEdges,
}: GraphPanelProps) {
  const { displayData: displayPropositions, hasDisplayData: hasNodes } = useStreamingMerge(
    propositions.length > 0 ? propositions : null,
    streamingPropositions,
    (data: PropositionNode[]) => data.length > 0,
  );
  const [exporting, setExporting] = useState(false);
  const [showArtifactPicker, setShowArtifactPicker] = useState(false);
  const [queueArtifactTypes, setQueueArtifactTypes] = useState<ArtifactType[]>([]);
  const [progressDismissed, setProgressDismissed] = useState(false);

  // Reset dismissed state when queue starts again
  useEffect(() => {
    if (queueProgress.status === "running") setProgressDismissed(false);
  }, [queueProgress.status]);
  const sourceCount = sourceDocuments.length;

  const queueActive = queueProgress.status === "running" || queueProgress.status === "paused";
  const processed = queueProgress.completed + queueProgress.failed + queueProgress.skipped;
  const progressPct = queueProgress.total > 0 ? (processed / queueProgress.total) * 100 : 0;

  const sourceColorMap: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < sourceDocuments.length; i++) {
      map[sourceDocuments[i].sourceId] = SOURCE_COLORS[i % SOURCE_COLORS.length];
    }
    return map;
  }, [sourceDocuments]);

  const buttonLabel = extractionStatus === "extracting"
    ? "Breaking down..."
    : `Break down ${sourceCount} source${sourceCount !== 1 ? "s" : ""}`;

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
          Breakdown
        </h2>
        <div className="flex items-center gap-2">
          {hasNodes && onAddNode && (
            <button
              onClick={onAddNode}
              className="rounded-full border border-[#DDD9D5] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink-black)] shadow-sm hover:bg-[#F5F1ED]"
              title="Add a new node to the graph"
            >
              + Node
            </button>
          )}
          {hasNodes && (
            <DownloadButton
              label={exporting ? "Exporting..." : "Export .png"}
              onClick={handleExportGraph}
              disabled={exporting}
            />
          )}
          {/* Formalize All / queue controls */}
          {hasNodes && !queueActive && !showArtifactPicker && (
            <button
              onClick={() => {
                // Default to global selection, or semiformal if nothing selected globally
                setQueueArtifactTypes(
                  globalArtifactTypes.length > 0 ? [...globalArtifactTypes] : ["semiformal"],
                );
                setShowArtifactPicker(true);
              }}
              disabled={extractionStatus === "extracting"}
              className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
            >
              {queueProgress.status === "done" ? "Generate All Again" : "Generate All"}
            </button>
          )}
          {queueActive && (
            <>
              {queueProgress.status === "running" ? (
                <button
                  onClick={onPauseQueue}
                  className="rounded-full border border-[#DDD9D5] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink-black)] shadow-sm hover:bg-[#F5F1ED]"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={onResumeQueue}
                  className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:shadow-md"
                >
                  Resume
                </button>
              )}
              <button
                onClick={onCancelQueue}
                className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50"
              >
                Cancel
              </button>
            </>
          )}
          {hasContent && (
            <button
              onClick={onDecompose}
              disabled={extractionStatus === "extracting" || queueActive}
              className="rounded-full bg-[var(--ink-black)] px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar — shown when queue is active or just finished */}
      {(queueActive || (queueProgress.status === "done" && !progressDismissed)) && queueProgress.total > 0 && (
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-2">
          <div className="flex items-center justify-between text-xs text-[#6B6560]">
            <span>
              {queueProgress.completed} done
              {queueProgress.failed > 0 && `, ${queueProgress.failed} failed`}
              {queueProgress.skipped > 0 && `, ${queueProgress.skipped} skipped`}
              {" / "}
              {queueProgress.total} total
            </span>
            <span className="flex items-center gap-2">
              {queueProgress.status === "paused" && "Paused"}
              {queueProgress.status === "running" && "Running..."}
              {queueProgress.status === "done" && "Done"}
              {queueProgress.status === "done" && (
                <button
                  onClick={() => setProgressDismissed(true)}
                  className="rounded p-0.5 text-[#9A9590] hover:text-[var(--ink-black)] transition-colors"
                  title="Dismiss"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
              )}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#DDD9D5]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                backgroundColor: queueProgress.failed > 0 ? "#dc2626" : "#15803d",
              }}
            />
          </div>
        </div>
      )}

      {/* Artifact type picker — shown when user clicks Formalize All */}
      {showArtifactPicker && (
        <div className="border-b border-[#DDD9D5] bg-[#FDFCFB] px-6 py-3">
          <p className="mb-2 text-xs font-medium text-[#6B6560]">
            Select output types to generate for all parts:
          </p>
          <ArtifactChipSelector
            selected={queueArtifactTypes}
            onChange={setQueueArtifactTypes}
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                setShowArtifactPicker(false);
                onFormalizeAll(queueArtifactTypes);
              }}
              disabled={queueArtifactTypes.length === 0}
              className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
            >
              Start ({queueArtifactTypes.length} type{queueArtifactTypes.length !== 1 ? "s" : ""})
            </button>
            <button
              onClick={() => setShowArtifactPicker(false)}
              className="rounded-full border border-[#DDD9D5] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink-black)] shadow-sm hover:bg-[#F5F1ED]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
            Add your source material in the Source panel first
          </div>
        )}

        {hasContent && !hasNodes && extractionStatus !== "extracting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[#9A9590]">
            <p>Click &quot;{buttonLabel}&quot; to extract key claims</p>
            {onAddNode && (
              <p>or <button onClick={onAddNode} className="text-[var(--ink-black)] underline hover:no-underline">add a node manually</button></p>
            )}
            {extractionStatus === "error" && (
              <p className="text-red-600">Extraction failed. Try again.</p>
            )}
          </div>
        )}

        {extractionStatus === "extracting" && !hasNodes && (
          <div className="flex flex-1 items-center justify-center text-sm text-[#6B6560]">
            Extracting key claims...
          </div>
        )}

        {hasNodes && displayPropositions && (
          <ProofGraph
            propositions={displayPropositions}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            sourceColorMap={sourceColorMap}
            initialPositions={graphLayout?.positions}
            onLayoutChange={onLayoutChange}
            onConnect={onConnectNodes}
            onEdgesDelete={onDeleteEdges}
            onNodeDelete={onDeleteNode}
            onNodeRename={onRenameNode}
          />
        )}
      </div>
    </div>
  );
}
