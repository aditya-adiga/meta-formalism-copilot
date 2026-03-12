"use client";

import { useState } from "react";
import RefinementButtons from "@/app/components/features/context-input/RefinementButtons";
import RefinementPreview from "@/app/components/features/context-input/RefinementPreview";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";

type ContextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onFormalise: () => void;
  loading: boolean;
  waitEstimate?: WaitTimeEstimate | null;
};

export default function ContextInput({ value, onChange, onFormalise, loading, waitEstimate }: ContextInputProps) {
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
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Scrollable content */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-auto p-6">
        <p className="text-sm text-[#6B6560]">
          Describe the theoretical direction, domain, or framework for formalizing your insight
        </p>
        <textarea
          id="context-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., Explore this in the context of decision theory within game-theoretic settings..."
          rows={10}
          className="min-h-0 flex-1 resize-none rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-4 py-3 text-[var(--ink-black)] placeholder-[#9A9590] shadow-md transition-shadow duration-200 focus:border-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] focus:shadow-lg"
          style={{ lineHeight: 1.7, caretColor: "#000000" }}
        />
        {value && !refining && <RefinementButtons onRefine={handleRefinement} />}
        {refining && <p className="text-xs text-[#6B6560]">Refining...</p>}
      </div>

      {/* Docked Formalise button */}
      <div className="shrink-0 border-t border-[#DDD9D5] px-4 py-3">
        <button
          type="button"
          onClick={onFormalise}
          disabled={loading || refining}
          className="relative w-full overflow-hidden rounded-full bg-[var(--ink-black)] px-6 py-2.5 text-sm font-medium text-white shadow-md transition-shadow duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
        >
          {loading && waitEstimate && (
            <span
              className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round(waitEstimate.progress * 100)}%` }}
            />
          )}
          <span className="relative">
            {loading
              ? waitEstimate
                ? `Formalising... ${waitEstimate.remainingLabel}`
                : "Formalising..."
              : "Formalise"}
          </span>
        </button>
      </div>
    </div>
  );
}
