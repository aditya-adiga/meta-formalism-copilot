"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import SendIcon from "@/app/components/ui/icons/SendIcon";
import { fetchApi } from "@/app/lib/formalization/api";

type EditableSectionProps = {
  /** The sub-object or value to edit */
  value: unknown;
  /** Called with the new parsed value when the user saves */
  onChange: (newValue: unknown) => void;
  /** The rendered view of this section */
  children: React.ReactNode;
};

/**
 * Wraps a rendered section card with inline JSON editing.
 * Shows a hover "Edit" button. When clicked, replaces the card with
 * a textarea (plain text for strings, pretty JSON for objects/arrays)
 * plus Save/Cancel buttons and an AI instruction bar.
 */
export default function EditableSection({ value, onChange, children }: EditableSectionProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isString = typeof value === "string";

  // Close editor if value changes externally (e.g. whole-document AI rewrite).
  // Uses a ref to track the previous serialized value so we only close on
  // genuine external changes, not after the user's own save.
  const prevSerializedRef = useRef<string | null>(null);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (prevSerializedRef.current !== null && prevSerializedRef.current !== serialized && editing) {
      setEditing(false);
    }
    prevSerializedRef.current = serialized;
  }, [serialized, editing]);

  const startEditing = useCallback(() => {
    const text = isString ? (value as string) : JSON.stringify(value, null, 2);
    setEditText(text);
    setParseError(null);
    setEditing(true);
  }, [value, isString]);

  const handleSave = useCallback(() => {
    if (isString) {
      onChange(editText);
    } else {
      try {
        onChange(JSON.parse(editText));
        setParseError(null);
      } catch {
        setParseError("Invalid JSON");
        return;
      }
    }
    setEditing(false);
  }, [editText, onChange, isString]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setParseError(null);
  }, []);

  const handleAiEdit = useCallback(async () => {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    try {
      if (isString) {
        // Plain text editing for string values
        const data = await fetchApi<{ text: string }>("/api/edit/whole", {
          fullText: editText,
          instruction: aiInstruction,
        });
        setEditText(data.text);
      } else {
        // JSON-aware editing for objects/arrays
        const data = await fetchApi<{ content: string }>("/api/edit/artifact", {
          content: editText,
          instruction: aiInstruction,
        });
        setEditText(data.content);
      }
      setAiInstruction("");
      setParseError(null);
    } catch (err) {
      console.error("[section ai edit]", err);
    } finally {
      setAiLoading(false);
    }
  }, [aiInstruction, editText, isString]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }, [handleCancel]);

  const handleAiKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAiEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }, [handleAiEdit, handleCancel]);

  if (!editing) {
    return (
      <div className="group relative">
        {children}
        <button
          onClick={startEditing}
          className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity rounded border border-[#DDD9D5] bg-[var(--ivory-cream)] px-1.5 py-0.5 text-[10px] text-[#6B6560] shadow-sm hover:shadow-md hover:text-[var(--ink-black)] focus:outline-none"
          aria-label="Edit section"
        >
          Edit
        </button>
      </div>
    );
  }

  const rows = isString
    ? Math.max(2, Math.min(editText.split("\n").length + 1, 8))
    : Math.max(4, Math.min(editText.split("\n").length + 1, 20));

  return (
    <div className="rounded border border-blue-300 bg-blue-50/30 px-3 py-2 space-y-2" onKeyDown={handleKeyDown}>
      {/* Header with save/cancel */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-blue-700">
          {aiLoading ? "Applying AI edit..." : "Editing"}
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleCancel}
            className="text-xs text-[#6B6560] hover:text-[var(--ink-black)] px-2 py-0.5 rounded border border-[#DDD9D5] bg-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-xs text-white bg-[var(--ink-black)] px-2 py-0.5 rounded hover:shadow-sm"
          >
            Save
          </button>
        </div>
      </div>

      {/* Editable textarea */}
      <textarea
        ref={textareaRef}
        value={editText}
        onChange={(e) => { setEditText(e.target.value); setParseError(null); }}
        className={`w-full resize-y rounded border ${parseError ? "border-red-300 bg-red-50/50" : "border-[#DDD9D5]"} bg-white px-3 py-2 ${isString ? "text-sm" : "font-mono text-xs"} text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-blue-300`}
        style={{ lineHeight: 1.6 }}
        rows={rows}
      />

      {parseError && <p className="text-xs text-red-600">{parseError}</p>}

      {/* AI edit bar */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={aiInstruction}
          onChange={(e) => setAiInstruction(e.target.value)}
          onKeyDown={handleAiKeyDown}
          placeholder="Edit with AI..."
          className="flex-1 rounded border border-[#DDD9D5] bg-white px-2 py-1 text-xs text-[var(--ink-black)] placeholder-[#9A9590] focus:outline-none focus:ring-1 focus:ring-blue-300"
          disabled={aiLoading}
        />
        <button
          onClick={handleAiEdit}
          disabled={!aiInstruction.trim() || aiLoading}
          className="flex shrink-0 items-center justify-center rounded bg-[var(--ink-black)] px-2 py-1 text-white disabled:opacity-40"
          aria-label="Apply AI edit"
        >
          <SendIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
