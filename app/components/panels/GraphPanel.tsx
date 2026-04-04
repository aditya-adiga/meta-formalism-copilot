"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { PropositionNode, SourceDocument } from "@/app/lib/types/decomposition";
import type { ArtifactType } from "@/app/lib/types/session";
import type { QueueProgress } from "@/app/hooks/useAutoFormalizeQueue";
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
}: GraphPanelProps) {
  const { displayData: displayPropositions, hasDisplayData: hasNodes } = useStreamingMerge(
    propositions.length > 0 ? propositions : null,
    streamingPropositions,
    (data) => data.length > 0,
  );
  const [exporting, setExporting] = useState(false);
  const [showArtifactPicker, setShowArtifactPicker] = useState(false);
  const [queueArtifactTypes, setQueueArtifactTypes] = useState<ArtifactType[]>([]);
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
          Decomposition
        </h2>
        <div className="flex items-center gap-2">
          {hasNodes && (
            <DownloadButton
              label={exporting ? "Exporting..." : "Export .png"}
              onClick={handleExportGraph}
              disabled={exporting}
            />
          )}
          {/* Formalize All / queue controls */}
          {hasNodes && !queueActive && queueProgress.status !== "done" && !showArtifactPicker && (
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
              Formalize All
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
      {(queueActive || queueProgress.status === "done") && queueProgress.total > 0 && (
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-2">
          <div className="flex items-center justify-between text-xs text-[#6B6560]">
            <span>
              {queueProgress.completed} verified
              {queueProgress.failed > 0 && `, ${queueProgress.failed} failed`}
              {queueProgress.skipped > 0 && `, ${queueProgress.skipped} skipped`}
              {" / "}
              {queueProgress.total} total
            </span>
            <span>
              {queueProgress.status === "paused" && "Paused"}
              {queueProgress.status === "running" && "Running..."}
              {queueProgress.status === "done" && "Done"}
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
            Select formalization types to generate for all nodes:
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

        {hasNodes && displayPropositions && (
          <ProofGraph
            propositions={displayPropositions}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            sourceColorMap={sourceColorMap}
          />
        )}
      </div>
    </div>
  );
}
