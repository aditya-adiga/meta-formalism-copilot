"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import InlineEditPopup from "@/app/components/features/output-editing/ai-bars/InlineEditPopup";
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
};

export default function EditableOutput({ value, onChange, onInlineEdit }: EditableOutputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState>(null);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (!selection || !showPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (textareaRef.current?.contains(target)) return;
      setShowPopup(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selection, showPopup]);

  const handleSelect = useCallback(() => {
    const textarea = textareaRef.current;
    const container = scrollContainerRef.current;
    if (!textarea || !container) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const selectedText = textarea.value.substring(start, end);
      
      // Get selection coordinates
      const coords = getSelectionCoordinates(textarea);
      if (!coords) {
        setSelection(null);
        return;
      }
      
      const containerRect = container.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();
      
      // Calculate position relative to textarea
      const relativeTop = coords.bottom - textarea.scrollTop;
      const absoluteTop = textareaRect.top + relativeTop;
      
      const spaceBelow = containerRect.bottom - absoluteTop;
      const spaceAbove = absoluteTop - containerRect.top;
      
      // Popup is roughly 60px tall, show above if not enough space below
      const showAbove = spaceBelow < 100 && spaceAbove > spaceBelow;
      
      setSelection({
        start,
        end,
        text: selectedText,
        position: {
          top: relativeTop + (showAbove ? -70 : 10),
          left: 0, // Will be centered via CSS
          showAbove,
        },
      });
      setShowPopup(false); // Don't show popup immediately
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

  // Cmd/Ctrl + K to show popup for selected text
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k' && selection && !showPopup) {
      e.preventDefault();
      setShowPopup(true);
    }
  }, [selection, showPopup]);

  return (
    <div
      ref={scrollContainerRef}
      className="relative flex-1 overflow-auto px-8 py-10"
    >
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

      {selection && showPopup && selection.position && (
        <div
          ref={popupRef}
          className="absolute left-0 right-0 z-50 flex justify-center"
          style={{
            top: `${selection.position.top}px`,
          }}
        >
          <InlineEditPopup
            selectedText={selection.text}
            onApply={handleApplyEdit}
            onClose={handleClosePopup}
          />
        </div>
      )}

      {selection && !showPopup && selection.position && (
        <button
          onClick={() => setShowPopup(true)}
          className="absolute left-0 right-0 z-40 mx-auto w-fit rounded-md bg-[var(--ink-black)] px-3 py-1.5 text-xs text-white shadow-lg transition-all hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2"
          style={{
            top: `${selection.position.top}px`,
          }}
          aria-label="Edit with AI"
        >
          Edit with AI (⌘/Ctrl + K)
        </button>
      )}
    </div>
  );
}
