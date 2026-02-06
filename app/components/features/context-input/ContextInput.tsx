"use client";

import { useState } from "react";
import RefinementButtons from "@/app/components/features/context-input/RefinementButtons";
import RefinementPreview from "@/app/components/features/context-input/RefinementPreview";

export default function ContextInput() {
  const [value, setValue] = useState("");
  const [refinedValue, setRefinedValue] = useState<string | null>(null);

  const handleRefinement = () => {
    // Placeholder: for now, use original text as refined version
    setRefinedValue(value);
  };

  const handleInsert = () => {
    if (refinedValue) {
      setValue(refinedValue);
      setRefinedValue(null);
    }
  };

  const handleCancel = () => {
    setRefinedValue(null);
  };

  if (refinedValue) {
    return (
      <RefinementPreview
        originalText={value}
        refinedText={refinedValue}
        onInsert={handleInsert}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <p className="text-xs text-[#6B6560]">
        Describe the theoretical direction, domain, or framework for formalizing your insight
      </p>
      <textarea
        id="context-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g., Explore this in the context of decision theory within game-theoretic settings..."
        rows={10}
        className="min-h-0 flex-1 resize-y rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-4 py-3 text-[var(--ink-black)] placeholder-[#9A9590] shadow-md transition-shadow duration-200 focus:border-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] focus:shadow-lg"
        style={{ lineHeight: 1.7, caretColor: "#000000" }}
      />

      {value && <RefinementButtons onRefine={handleRefinement} />}

      <button
        type="button"
        className="shrink-0 w-full rounded-full bg-[var(--ink-black)] px-6 py-3 text-sm font-medium text-white shadow-lg transition-shadow duration-200 hover:shadow-xl active:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)]"
      >
        Formalise
      </button>
    </div>
  );
}
