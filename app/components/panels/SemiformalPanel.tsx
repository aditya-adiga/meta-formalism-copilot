"use client";

import { useCallback, useEffect, useState } from "react";
import EditableOutput from "@/app/components/features/output-editing/EditableOutput";
import WholeTextEditBar from "@/app/components/features/output-editing/ai-bars/WholeTextEditBar";

type SemiformalPanelProps = {
  semiformalText: string;
  onSemiformalTextChange: (value: string) => void;
  sessionBanner?: React.ReactNode;
};

export default function SemiformalPanel({ semiformalText, onSemiformalTextChange, sessionBanner }: SemiformalPanelProps) {
  const [editing, setEditing] = useState(false);
  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");

  // Switch back to rendered view when new semiformal content arrives
  useEffect(() => {
    if (semiformalText && renderMode !== "raw") setRenderMode("rendered");
  }, [semiformalText]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleEdit = useCallback(() => {
    setRenderMode((m) => (m === "rendered" ? "raw" : "rendered"));
  }, []);

  const handleInlineEdit = useCallback(async (instruction: string, selection: { start: number; end: number; text: string }) => {
    setEditing(true);
    try {
      const response = await fetch("/api/edit/inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullText: semiformalText, selection, instruction }),
      });
      const data = await response.json();
      if (response.ok) {
        const newText = semiformalText.slice(0, selection.start) + data.text + semiformalText.slice(selection.end);
        onSemiformalTextChange(newText);
        setRenderMode("rendered");
      } else {
        console.error("[inline edit]", data.error);
      }
    } catch (err) {
      console.error("[inline edit]", err);
    } finally {
      setEditing(false);
    }
  }, [semiformalText, onSemiformalTextChange]);

  const handleWholeTextEdit = useCallback(async (instruction: string) => {
    setEditing(true);
    try {
      const response = await fetch("/api/edit/whole", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullText: semiformalText, instruction }),
      });
      const data = await response.json();
      if (response.ok) {
        onSemiformalTextChange(data.text);
        setRenderMode("rendered");
      } else {
        console.error("[whole edit]", data.error);
      }
    } catch (err) {
      console.error("[whole edit]", err);
    } finally {
      setEditing(false);
    }
  }, [semiformalText, onSemiformalTextChange]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {editing && (
        <div className="absolute inset-x-0 top-0 z-40 bg-[var(--ink-black)] px-4 py-1.5 text-center text-xs text-white/90">
          Applying edit...
        </div>
      )}

      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
          Semiformal Proof
        </h2>
        {sessionBanner}
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
    </div>
  );
}
