"use client";

import { useMemo } from "react";
import type { CounterexamplesResponse } from "@/app/lib/types/artifacts";
import ArtifactPanelShell, { type ArtifactEditingProps } from "./ArtifactPanelShell";
import EditableSection from "@/app/components/features/output-editing/EditableSection";
import CollapsibleSection from "@/app/components/ui/CollapsibleSection";
import { useFieldUpdaters } from "@/app/hooks/useFieldUpdaters";
import FindEvidenceButton from "@/app/components/features/evidence-search/FindEvidenceButton";
import { WHOLE_ARTIFACT_ELEMENT_ID } from "@/app/lib/types/evidence";

const PLAUSIBILITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-green-100 text-green-700",
};

type CounterexamplesPanelProps = {
  counterexamples: CounterexamplesResponse["counterexamples"] | null;
  loading?: boolean;
  onContentChange?: (json: string) => void;
} & ArtifactEditingProps;

// Support legacy persisted data that used "counterexamples" as the array field name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getScenarios(data: any): CounterexamplesResponse["counterexamples"]["scenarios"] | undefined {
  return data?.scenarios ?? data?.counterexamples;
}

export default function CounterexamplesPanel({
  counterexamples, loading,
  onContentChange, onAiEdit, editing, editWaitEstimate,
}: CounterexamplesPanelProps) {
  const scenarios = getScenarios(counterexamples);
  const { updateField, updateArrayItem } = useFieldUpdaters(counterexamples, onContentChange);

  const artifactJson = useMemo(
    () => counterexamples ? JSON.stringify(counterexamples) : undefined,
    [counterexamples],
  );

  // Build search description from claim + top counterexample scenarios
  const evidenceSearchContent = useMemo(() => {
    if (!counterexamples) return "";
    const parts = [counterexamples.claim];
    for (const cx of (scenarios ?? []).slice(0, 3)) {
      parts.push(cx.scenario);
    }
    return parts.filter(Boolean).join(". ");
  }, [counterexamples, scenarios]);

  return (
    <ArtifactPanelShell
      title="Counterexamples"
      loading={loading}
      hasData={counterexamples !== null}
      emptyMessage="No counterexamples yet. Generate them from the source panel or node detail."
      loadingMessage="Generating counterexamples..."
      onAiEdit={onAiEdit}
      editing={editing}
      editWaitEstimate={editWaitEstimate}
    >
      {counterexamples && (
        <>
          {/* Summary */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <EditableSection value={counterexamples.summary} onChange={(v) => updateField("summary", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">{counterexamples.summary}</p>
            </EditableSection>
          </section>

          {/* Claim under test */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Claim Under Test</h3>
            <EditableSection value={counterexamples.claim} onChange={(v) => updateField("claim", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed italic">{counterexamples.claim}</p>
            </EditableSection>
          </section>

          {/* Counterexamples */}
          <CollapsibleSection title="Counterexamples" defaultOpen={false} count={scenarios?.length ?? 0}>
            <div className="space-y-3">
              {scenarios?.map((cx, i) => (
                <EditableSection key={cx.id} value={cx} onChange={(newCx) => updateArrayItem("scenarios", i, newCx)}>
                  <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-2">
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
                </EditableSection>
              ))}
            </div>
          </CollapsibleSection>

          {/* Robustness Assessment */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Robustness Assessment</h3>
            <EditableSection value={counterexamples.robustnessAssessment} onChange={(v) => updateField("robustnessAssessment", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">{counterexamples.robustnessAssessment}</p>
            </EditableSection>
          </section>

          {/* Evidence search — one search for the whole artifact */}
          {evidenceSearchContent && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Evidence
              </h3>
              <FindEvidenceButton
                artifactType="counterexamples"
                elementId={WHOLE_ARTIFACT_ELEMENT_ID}
                elementContent={evidenceSearchContent}
                artifactJson={artifactJson}
                onContentChange={onContentChange}
              />
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
