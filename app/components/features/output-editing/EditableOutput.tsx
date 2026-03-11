"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import InlineEditPopup from "@/app/components/features/output-editing/ai-bars/InlineEditPopup";
import LatexRenderer from "@/app/components/features/output-editing/LatexRenderer";
import { getSelectionCoordinates } from "@/app/lib/utils/textSelection";

const PLACEHOLDER = "Processed output will appear here.";

export type SelectionState = {
  start: number;
  end: number;
  text: string;
  position?: { top: number; left: number; showAbove: boolean };
} | null;

type EditableOutputProps = {
  value: string;
  onChange: (value: string) => void;
  onInlineEdit: (instruction: string, selection: { start: number; end: number; text: string }) => void;
  renderMode: "rendered" | "raw";
  onToggleEdit: () => void;
};

export default function EditableOutput({ value, onChange, onInlineEdit, renderMode, onToggleEdit }: EditableOutputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState>(null);
  const [showPopup, setShowPopup] = useState(false);

  // Focus textarea when switching to raw mode
  useEffect(() => {
    if (renderMode === "raw") {
      textareaRef.current?.focus();
    }
  }, [renderMode]);

  // Derive effective selection/popup: suppress in rendered mode without a setState call
  const activeSelection = renderMode === "raw" ? selection : null;
  const activeShowPopup = renderMode === "raw" ? showPopup : false;

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
      if (!coords) {
        setSelection(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();

      const relativeTop = coords.bottom - textarea.scrollTop;
      const absoluteTop = textareaRect.top + relativeTop;

      const spaceBelow = containerRect.bottom - absoluteTop;
      const spaceAbove = absoluteTop - containerRect.top;

      const showAbove = spaceBelow < 100 && spaceAbove > spaceBelow;

      setSelection({
        start,
        end,
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

  const handleClosePopup = useCallback(() => {
    setShowPopup(false);
  }, []);

  const handleApplyEdit = useCallback((instruction: string) => {
    if (selection) {
      onInlineEdit(instruction, { start: selection.start, end: selection.end, text: selection.text });
    }
    setShowPopup(false);
    setSelection(null);
  }, [selection, onInlineEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k' && activeSelection && !activeShowPopup) {
      e.preventDefault();
      setShowPopup(true);
    }
  }, [activeSelection, activeShowPopup]);

  return (
    <div
      ref={scrollContainerRef}
      className="relative flex-1 overflow-auto px-8 py-10"
    >
      {/* Toggle button — top right of the pane */}
      {(value || renderMode === "raw") && (
        <button
          onClick={onToggleEdit}
          className="absolute right-4 top-4 z-30 rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-3 py-1 text-xs text-[#6B6560] shadow-sm transition-shadow hover:shadow-md hover:text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"
          aria-label={renderMode === "rendered" ? "Edit raw text" : "Show rendered view"}
        >
          {renderMode === "rendered" ? "Edit" : "Done editing"}
        </button>
      )}

      <div
        ref={scrollContainerRef}
        className="h-full overflow-auto px-8 py-10"
      >

      {renderMode === "rendered" ? (
        /* ── Rendered LaTeX view ── */
        <LatexRenderer value={value} />
      ) : (
        /* ── Raw textarea for editing ── */
        <>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER}
            className="min-h-full w-full resize-none rounded-md border-0 bg-transparent px-0 py-0 text-[var(--ink-black)] placeholder-[#6B6560] focus:outline-none focus:ring-0 selection:bg-[#FFE5B4] selection:text-[var(--ink-black)]"
            style={{ lineHeight: 1.9, caretColor: "#000000" }}
            aria-label="Output content"
          />

          {activeSelection && activeShowPopup && activeSelection.position && (
            <div
              ref={popupRef}
              className="absolute left-0 right-0 z-50 flex justify-center"
              style={{ top: `${activeSelection.position.top}px` }}
            >
              <InlineEditPopup
                selectedText={activeSelection.text}
                onApply={handleApplyEdit}
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
        </>
      )}
      </div>
    </div>
  );
}
