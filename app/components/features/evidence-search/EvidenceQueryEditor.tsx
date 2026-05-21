"use client";

import { useState } from "react";

type EvidenceQueryEditorProps = {
  /** Queries from the most recent run; seeds the editable list. */
  queries: string[];
  /** True while a search is in flight. */
  isLoading: boolean;
  /** Called with the trimmed, non-empty query list when the user re-runs. */
  onRerun: (queries: string[]) => void;
};

/** Inline editor for the OpenAlex search queries. Replaces the read-only
 *  "Searched: …" line so users can refine queries and re-run. */
export default function EvidenceQueryEditor({
  queries,
  isLoading,
  onRerun,
}: EvidenceQueryEditorProps) {
  // Seed once from props; the user's edits are local until they re-run.
  const [draft, setDraft] = useState<string[]>(queries.length > 0 ? queries : [""]);

  const updateAt = (i: number, value: string) =>
    setDraft((d) => d.map((q, idx) => (idx === i ? value : q)));
  const removeAt = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));
  const addRow = () => setDraft((d) => [...d, ""]);

  const handleRerun = () => {
    const cleaned = draft.map((q) => q.trim()).filter((q) => q.length > 0);
    if (cleaned.length === 0) return;
    onRerun(cleaned);
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[#9A9590]">
        Search queries
      </div>
      {draft.map((q, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            value={q}
            onChange={(e) => updateAt(i, e.target.value)}
            className="min-w-0 flex-1 rounded border border-[#DDD9D5] bg-white px-2 py-1 text-xs text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
          />
          <button
            type="button"
            aria-label="Remove query"
            onClick={() => removeAt(i)}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-[#9A9590] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
          >
            &#10005;
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded text-xs text-[#6B6560] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
        >
          + add query
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={handleRerun}
          className="ml-auto rounded-md border border-[#DDD9D5] px-2 py-0.5 text-xs text-[#6B6560] hover:bg-[#F5F1ED] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30 active:bg-[#ECE7E2] disabled:cursor-wait disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Re-run ⟳"}
        </button>
      </div>
    </div>
  );
}
