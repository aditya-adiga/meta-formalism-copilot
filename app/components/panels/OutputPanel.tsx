"use client";

import { useState, useCallback } from "react";
import EditableOutput from "@/app/components/features/output-editing/EditableOutput";
import WholeTextEditBar from "@/app/components/features/output-editing/ai-bars/WholeTextEditBar";

export default function OutputPanel() {
  const [value, setValue] = useState("");

  const handleInlineEdit = useCallback((instruction: string, selection: { start: number; end: number; text: string }) => {
    // Placeholder: backend integration later
    console.log("Inline edit instruction:", instruction, "Selection:", selection);
  }, []);

  const handleWholeTextEdit = useCallback((instruction: string) => {
    // Placeholder: edit entire output with instruction
    console.log("Editing whole text with:", instruction, value);
  }, [value]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      <EditableOutput
        value={value}
        onChange={setValue}
        onInlineEdit={handleInlineEdit}
      />

      {/* Floating bottom bar for editing whole text */}
      {value && <WholeTextEditBar onApply={handleWholeTextEdit} />}
    </div>
  );
}
