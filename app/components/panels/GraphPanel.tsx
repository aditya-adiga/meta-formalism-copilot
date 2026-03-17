"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import type { PropositionNode, SourceDocument } from "@/app/lib/types/decomposition";
import type { QueueProgress } from "@/app/hooks/useAutoFormalizeQueue";
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
  queueProgress: QueueProgress;
  onFormalizeAll: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onCancelQueue: () => void;
};

export default function GraphPanel({
  propositions,
  selectedNodeId,
  onSelectNode,
  hasContent,
  sourceDocuments,
  extractionStatus,
  onDecompose,
  queueProgress,
  onFormalizeAll,
  onPauseQueue,
  onResumeQueue,
  onCancelQueue,
}: GraphPanelProps) {
  const hasNodes = propositions.length > 0;
  const [exporting, setExporting] = useState(false);
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
          {hasNodes && !queueActive && (
            <button
              onClick={onFormalizeAll}
              disabled={extractionStatus === "extracting"}
              className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-shadow hover:shadow-md disabled:opacity-50"
            >
              {queueProgress.status === "done" ? "Re-formalize All" : "Formalize All"}
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
              {queueProgress.completed} verified
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
