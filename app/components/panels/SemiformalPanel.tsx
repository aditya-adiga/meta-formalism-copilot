"use client";

import { useCallback, useEffect, useState } from "react";
import EditableOutput from "@/app/components/features/output-editing/EditableOutput";
import WholeTextEditBar from "@/app/components/features/output-editing/ai-bars/WholeTextEditBar";
import DownloadButton from "@/app/components/ui/DownloadButton";
import { downloadSemiformalAsMarkdown } from "@/app/lib/utils/export";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import { useWaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import { fetchApi } from "@/app/lib/formalization/api";

type SemiformalPanelProps = {
  semiformalText: string;
  onSemiformalTextChange: (value: string) => void;
  sessionBanner?: React.ReactNode;
  onGenerateLean?: () => void;
  showGenerateLean?: boolean;
  leanLoading?: boolean;
  waitEstimate?: WaitTimeEstimate | null;
};

export default function SemiformalPanel({ semiformalText, onSemiformalTextChange, sessionBanner, onGenerateLean, showGenerateLean, leanLoading, waitEstimate }: SemiformalPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editEndpoint, setEditEndpoint] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");

  const editWaitEstimate = useWaitTimeEstimate(editEndpoint, semiformalText.length);

  // Switch back to rendered view when new semiformal content arrives
  useEffect(() => {
    if (semiformalText && renderMode !== "raw") setRenderMode("rendered");
  }, [semiformalText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleEdit = useCallback(() => {
    setRenderMode((m) => (m === "rendered" ? "raw" : "rendered"));
  }, []);

  const handleInlineEdit = useCallback(async (instruction: string, selection: { start: number; end: number; text: string }) => {
    setEditing(true);
    setEditEndpoint("edit/inline");
    try {
      const data = await fetchApi<{ text: string }>("/api/edit/inline", { fullText: semiformalText, selection, instruction });
      const newText = semiformalText.slice(0, selection.start) + data.text + semiformalText.slice(selection.end);
      onSemiformalTextChange(newText);
      setRenderMode("rendered");
    } catch (err) {
      console.error("[inline edit]", err);
    } finally {
      setEditing(false);
      setEditEndpoint(null);
    }
  }, [semiformalText, onSemiformalTextChange]);

  const handleWholeTextEdit = useCallback(async (instruction: string) => {
    setEditing(true);
    setEditEndpoint("edit/whole");
    try {
      const data = await fetchApi<{ text: string }>("/api/edit/whole", { fullText: semiformalText, instruction });
      onSemiformalTextChange(data.text);
      setRenderMode("rendered");
    } catch (err) {
      console.error("[whole edit]", err);
    } finally {
      setEditing(false);
      setEditEndpoint(null);
    }
  }, [semiformalText, onSemiformalTextChange]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {editing && (
        <div className="absolute inset-x-0 top-0 z-40 overflow-hidden bg-[var(--ink-black)] px-4 py-1.5 text-center text-xs text-white/90">
          {editWaitEstimate && (
            <span
              className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round(editWaitEstimate.progress * 100)}%` }}
            />
          )}
          <span className="relative">
            Applying edit...{editWaitEstimate ? ` ${editWaitEstimate.remainingLabel}` : ""}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Semiformal Proof
          </h2>
          {!semiformalText && waitEstimate && (
            <span className="text-xs text-[#6B6560]">
              Generating... {waitEstimate.remainingLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sessionBanner}
          {semiformalText && (
            <DownloadButton
              label="Export .md"
              onClick={() => downloadSemiformalAsMarkdown(semiformalText)}
            />
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <EditableOutput
          value={semiformalText}
          onChange={onSemiformalTextChange}
          onInlineEdit={handleInlineEdit}
          renderMode={renderMode}
          onToggleEdit={handleToggleEdit}
        />
        {semiformalText && !editing && <WholeTextEditBar onApply={handleWholeTextEdit} />}
      </div>

      {showGenerateLean && (
        <div className="shrink-0 border-t border-[#DDD9D5] px-4 py-3">
          <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Review and edit the semiformal proof above, then generate Lean4 code when ready.
          </div>
          <button
            type="button"
            onClick={onGenerateLean}
            disabled={leanLoading}
            className="w-full rounded-full bg-[var(--ink-black)] px-6 py-2.5 text-sm font-medium text-white shadow-md transition-shadow duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
          >
            {leanLoading ? "Generating..." : "Generate Lean4 Code"}
          </button>
        </div>
      )}
    </div>
  );
}
