"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import InlineEditPopup from "@/app/components/features/output-editing/ai-bars/InlineEditPopup";
import WholeTextEditBar from "@/app/components/features/output-editing/ai-bars/WholeTextEditBar";
import type { SelectionState } from "@/app/components/features/output-editing/EditableOutput";
import { getSelectionCoordinates } from "@/app/lib/utils/textSelection";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";

/** Shared editing props accepted by all structured artifact panels. */
export type ArtifactEditingProps = {
  /** JSON string of the artifact content — enables editing when provided */
  editableContent?: string | null;
  /** Called when an edit produces new JSON content */
  onContentChange?: (json: string) => void;
  /** Called with instruction + optional selection for AI edits */
  onAiEdit?: (instruction: string, selection?: { start: number; end: number; text: string }) => void;
  /** Whether an AI edit is currently in flight */
  editing?: boolean;
  /** Wait time estimate for the in-flight edit */
  editWaitEstimate?: WaitTimeEstimate | null;
};

type ArtifactPanelShellProps = {
  title: string;
  loading?: boolean;
  hasData: boolean;
  emptyMessage: string;
  loadingMessage: string;
  children: ReactNode;
} & ArtifactEditingProps;

/**
 * Shared shell for artifact panels (causal graph, statistical model, etc.).
 * Handles the outer container, header bar, empty state, loading state,
 * and — when editableContent is provided — edit mode with inline + whole-text AI editing.
 */
export default function ArtifactPanelShell({
  title,
  loading,
  hasData,
  emptyMessage,
  loadingMessage,
  children,
  editableContent,
  onContentChange,
  onAiEdit,
  editing,
  editWaitEstimate,
}: ArtifactPanelShellProps) {
  const editable = editableContent != null && onContentChange != null && onAiEdit != null;
  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");

  // Reset to rendered view when new content arrives from generation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync render mode with data availability
    if (hasData && renderMode !== "raw") setRenderMode("rendered");
  }, [hasData]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Inline edit state (only active in raw mode) ---
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [selection, setSelection] = useState<SelectionState>(null);
  const [showPopup, setShowPopup] = useState(false);

  const activeSelection = renderMode === "raw" ? selection : null;
  const activeShowPopup = renderMode === "raw" ? showPopup : false;

  // Focus textarea when switching to raw mode
  useEffect(() => {
    if (renderMode === "raw") textareaRef.current?.focus();
  }, [renderMode]);

  // Close popup on outside click
  useEffect(() => {
    if (!activeSelection || !activeShowPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (textareaRef.current?.contains(target)) return;
      setShowPopup(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeSelection, activeShowPopup]);

  const handleSelect = useCallback(() => {
    const textarea = textareaRef.current;
    const container = scrollContainerRef.current;
    if (!textarea || !container) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const selectedText = textarea.value.substring(start, end);
      const coords = getSelectionCoordinates(textarea);
      if (!coords) { setSelection(null); return; }

      const containerRect = container.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();
      const relativeTop = coords.bottom - textarea.scrollTop;
      const absoluteTop = textareaRect.top + relativeTop;
      const spaceBelow = containerRect.bottom - absoluteTop;
      const spaceAbove = absoluteTop - containerRect.top;
      const showAbove = spaceBelow < 100 && spaceAbove > spaceBelow;

      setSelection({
        start, end,
        text: selectedText,
        position: {
          top: relativeTop + (showAbove ? -70 : 10),
          left: 0,
          showAbove,
        },
      });
      setShowPopup(false);
    } else {
      setSelection(null);
      setShowPopup(false);
    }
  }, []);

  const handleClosePopup = useCallback(() => setShowPopup(false), []);

  const handleApplyInlineEdit = useCallback((instruction: string) => {
    if (selection && onAiEdit) {
      onAiEdit(instruction, { start: selection.start, end: selection.end, text: selection.text });
    }
    setShowPopup(false);
    setSelection(null);
  }, [selection, onAiEdit]);

  const handleWholeEdit = useCallback((instruction: string) => {
    onAiEdit?.(instruction);
  }, [onAiEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k" && activeSelection && !activeShowPopup) {
      e.preventDefault();
      setShowPopup(true);
    }
  }, [activeSelection, activeShowPopup]);

  const handleToggleEdit = useCallback(() => {
    setRenderMode((m) => (m === "rendered" ? "raw" : "rendered"));
  }, []);

  // Pretty-print JSON for the raw textarea (memoized to avoid re-parsing on unrelated renders)
  const prettyContent = useMemo(() => {
    if (!editableContent) return "";
    try { return JSON.stringify(JSON.parse(editableContent), null, 2); }
    catch { return editableContent; }
  }, [editableContent]);

  const header = (
    <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
        {title}
      </h2>
      {editable && hasData && (
        <button
          onClick={handleToggleEdit}
          className="rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-3 py-1 text-xs text-[#6B6560] shadow-sm transition-shadow hover:shadow-md hover:text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"
        >
          {renderMode === "rendered" ? "Edit" : "Done editing"}
        </button>
      )}
    </div>
  );

  if (!hasData && !loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
        {header}
        <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590] px-8 text-center">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Edit progress banner */}
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

      {header}

      {loading && !hasData ? (
        <div className="flex-1 px-8 py-10 text-sm text-[#6B6560]">
          {loadingMessage}
        </div>
      ) : renderMode === "raw" && editable ? (
        /* ── Raw JSON editing view ── */
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={scrollContainerRef} className="h-full flex-1 overflow-auto px-6 py-4">
            <textarea
              ref={textareaRef}
              value={prettyContent}
              onChange={(e) => onContentChange(e.target.value)}
              onSelect={handleSelect}
              onKeyDown={handleKeyDown}
              className="min-h-full w-full resize-none rounded-md border-0 bg-transparent px-0 py-0 font-mono text-sm text-[var(--ink-black)] placeholder-[#6B6560] focus:outline-none focus:ring-0 selection:bg-[#FFE5B4] selection:text-[var(--ink-black)]"
              style={{ lineHeight: 1.7, caretColor: "#000000" }}
              aria-label="Edit artifact JSON"
            />

            {activeSelection && activeShowPopup && activeSelection.position && (
              <div
                ref={popupRef}
                className="absolute left-0 right-0 z-50 flex justify-center"
                style={{ top: `${activeSelection.position.top}px` }}
              >
                <InlineEditPopup
                  selectedText={activeSelection.text}
                  onApply={handleApplyInlineEdit}
                  onClose={handleClosePopup}
                />
              </div>
            )}

            {activeSelection && !activeShowPopup && activeSelection.position && (
              <button
                onClick={() => setShowPopup(true)}
                className="absolute left-0 right-0 z-40 mx-auto w-fit rounded-md bg-[var(--ink-black)] px-3 py-1.5 text-xs text-white shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2"
                style={{ top: `${activeSelection.position.top}px` }}
                aria-label="Edit with AI"
              >
                Edit with AI (⌘/Ctrl + K)
              </button>
            )}
          </div>

          {!editing && <WholeTextEditBar onApply={handleWholeEdit} />}
        </div>
      ) : (
        /* ── Rendered card view ── */
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {children}
          </div>
          {editable && !editing && <WholeTextEditBar onApply={handleWholeEdit} />}
        </div>
      )}
    </div>
  );
}
