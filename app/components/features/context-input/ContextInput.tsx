"use client";

import { useState } from "react";
import RefinementButtons from "@/app/components/features/context-input/RefinementButtons";
import RefinementPreview from "@/app/components/features/context-input/RefinementPreview";

type ContextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onFormalise: () => void;
  loading: boolean;
};

export default function ContextInput({ value, onChange, onFormalise, loading }: ContextInputProps) {
  const [refinedValue, setRefinedValue] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);

  const handleRefinement = async (actionId: string) => {
    setRefining(true);
    try {
      const response = await fetch("/api/refine/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, action: actionId }),
      });
      const data = await response.json();
      if (response.ok) {
        setRefinedValue(data.text);
      } else {
        console.error("[refine]", data.error);
      }
    } catch (err) {
      console.error("[refine]", err);
    } finally {
      setRefining(false);
    }
  };

  const handleInsert = () => {
    if (refinedValue) {
      onChange(refinedValue);
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
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., Explore this in the context of decision theory within game-theoretic settings..."
        rows={10}
        className="min-h-0 flex-1 resize-y rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-4 py-3 text-[var(--ink-black)] placeholder-[#9A9590] shadow-md transition-shadow duration-200 focus:border-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] focus:shadow-lg"
        style={{ lineHeight: 1.7, caretColor: "#000000" }}
      />

      {value && !refining && <RefinementButtons onRefine={handleRefinement} />}
      {refining && (
        <p className="text-xs text-[#6B6560]">Refining...</p>
      )}

      <button
        type="button"
        onClick={onFormalise}
        disabled={loading || refining}
        className="shrink-0 w-full rounded-full bg-[var(--ink-black)] px-6 py-3 text-sm font-medium text-white shadow-lg transition-shadow duration-200 hover:shadow-xl active:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
      >
        {loading ? "Formalising..." : "Formalise"}
      </button>
    </div>
  );
}
