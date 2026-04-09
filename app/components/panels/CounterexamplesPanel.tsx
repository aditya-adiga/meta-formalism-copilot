"use client";

import { useMemo } from "react";
import type { CounterexamplesResponse } from "@/app/lib/types/artifacts";
import ArtifactPanelShell from "./ArtifactPanelShell";
import FindEvidenceButton from "@/app/components/features/evidence-search/FindEvidenceButton";

const PLAUSIBILITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-green-100 text-green-700",
};

type CounterexamplesPanelProps = {
  counterexamples: CounterexamplesResponse["counterexamples"] | null;
  loading?: boolean;
};

export default function CounterexamplesPanel({ counterexamples, loading }: CounterexamplesPanelProps) {
  // Build search description from claim + top counterexample scenarios
  const evidenceSearchContent = useMemo(() => {
    if (!counterexamples) return "";
    const parts = [counterexamples.claim];
    for (const cx of counterexamples.counterexamples.slice(0, 3)) {
      parts.push(cx.scenario);
    }
    return parts.filter(Boolean).join(". ");
  }, [counterexamples]);

  return (
    <ArtifactPanelShell
      title="Counterexamples"
      loading={loading}
      hasData={counterexamples !== null}
      emptyMessage="No counterexamples yet. Generate them from the source panel or node detail."
      loadingMessage="Generating counterexamples..."
    >
      {counterexamples && (
        <>
          {/* Summary */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <p className="text-sm text-[var(--ink-black)] leading-relaxed">{counterexamples.summary}</p>
          </section>

          {/* Claim under test */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Claim Under Test</h3>
            <p className="text-sm text-[var(--ink-black)] leading-relaxed italic">{counterexamples.claim}</p>
          </section>

          {/* Counterexamples */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Counterexamples ({counterexamples.counterexamples.length})
            </h3>
            <div className="space-y-3">
              {counterexamples.counterexamples.map((cx) => (
                <div key={cx.id} className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#9A9590]">{cx.id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLAUSIBILITY_STYLES[cx.plausibility] ?? ""}`}>
                      {cx.plausibility}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--ink-black)]">{cx.scenario}</p>
                  <div className="text-xs text-[#6B6560]">
                    <span className="font-semibold">Targets:</span> {cx.targetAssumption}
                  </div>
                  <div className="text-xs text-[#6B6560]">
                    <span className="font-semibold">Why it works:</span> {cx.explanation}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Robustness Assessment */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Robustness Assessment</h3>
            <p className="text-sm text-[var(--ink-black)] leading-relaxed">{counterexamples.robustnessAssessment}</p>
          </section>

          {/* Evidence search — one search for the whole artifact */}
          {evidenceSearchContent && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Evidence
              </h3>
              <FindEvidenceButton
                artifactType="counterexamples"
                elementId="artifact"
                elementContent={evidenceSearchContent}
              />
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
