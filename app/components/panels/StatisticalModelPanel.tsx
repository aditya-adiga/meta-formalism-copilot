"use client";

import type { StatisticalModelResponse } from "@/app/lib/types/artifacts";
import { mergeStreamingPreview } from "@/app/lib/utils/mergeStreamingPreview";
import ArtifactPanelShell, { type ArtifactEditingProps } from "./ArtifactPanelShell";
import EditableSection from "@/app/components/features/output-editing/EditableSection";
import { useFieldUpdaters } from "@/app/hooks/useFieldUpdaters";

type StatisticalModelPanelProps = {
  statisticalModel: StatisticalModelResponse["statisticalModel"] | null;
  /** Partial model data from streaming (partial-JSON parsed) */
  streamingPreview?: StatisticalModelResponse["statisticalModel"] | null;
  loading?: boolean;
  onContentChange?: (json: string) => void;
} & ArtifactEditingProps;

const ROLE_COLORS: Record<string, string> = {
  independent: "text-blue-700 bg-blue-50 border-blue-200",
  dependent: "text-purple-700 bg-purple-50 border-purple-200",
  confounding: "text-amber-700 bg-amber-50 border-amber-200",
  control: "text-gray-700 bg-gray-50 border-gray-200",
};

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? "text-gray-700 bg-gray-50 border-gray-200";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-mono ${color}`}>
      {role}
    </span>
  );
}

export default function StatisticalModelPanel({
  statisticalModel, streamingPreview, loading,
  onContentChange, onAiEdit, editing, editWaitEstimate,
}: StatisticalModelPanelProps) {
  const { updateField, updateArrayItem } = useFieldUpdaters(statisticalModel, onContentChange);
  const { displayData: displayModel, hasDisplayData } = mergeStreamingPreview(
    statisticalModel, streamingPreview,
    (d) => (d.variables?.length ?? 0) > 0,
  );

  return (
    <ArtifactPanelShell
      title="Statistical Model"
      loading={loading && !hasDisplayData}
      hasData={hasDisplayData}
      emptyMessage="No statistical model yet. Generate one from the source panel or node detail."
      loadingMessage="Generating statistical model..."
      onAiEdit={onAiEdit}
      editing={editing}
      editWaitEstimate={editWaitEstimate}
    >
      {hasDisplayData && displayModel && (
        <>
          {/* Summary */}
          {displayModel.summary && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <EditableSection value={displayModel.summary} onChange={(v) => updateField("summary", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">{displayModel.summary}</p>
            </EditableSection>
          </section>
          )}

          {/* Variables */}
          {(displayModel.variables?.length ?? 0) > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Variables ({displayModel.variables.length})
            </h3>
            <div className="space-y-2">
              {displayModel.variables.map((v, i) => (
                <EditableSection key={v.id} value={v} onChange={(newV) => updateArrayItem("variables", i, newV)}>
                  <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#9A9590]">{v.id}</span>
                      <span className="text-sm font-medium text-[var(--ink-black)]">{v.label}</span>
                      <RoleBadge role={v.role} />
                    </div>
                    {v.distribution && (
                      <p className="mt-1 text-xs text-[#6B6560]">Distribution: {v.distribution}</p>
                    )}
                  </div>
                </EditableSection>
              ))}
            </div>
          </section>
          )}

          {/* Hypotheses */}
          {(displayModel.hypotheses?.length ?? 0) > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Hypotheses ({displayModel.hypotheses.length})
            </h3>
            <div className="space-y-2">
              {displayModel.hypotheses.map((h, i) => (
                <EditableSection key={h.id} value={h} onChange={(newH) => updateArrayItem("hypotheses", i, newH)}>
                  <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                    <p className="text-sm font-medium text-[var(--ink-black)]">{h.statement}</p>
                    <p className="mt-1 text-xs text-[#6B6560]">
                      <span className="font-semibold">H₀:</span> {h.nullHypothesis}
                    </p>
                    <p className="mt-1 text-xs text-[#9A9590]">
                      <span className="font-semibold">Test:</span> {h.testSuggestion}
                    </p>
                  </div>
                </EditableSection>
              ))}
            </div>
          </section>
          )}

          {/* Assumptions */}
          {(displayModel.assumptions?.length ?? 0) > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Assumptions ({displayModel.assumptions.length})
              </h3>
              <div className="space-y-1 pl-5">
                {displayModel.assumptions.map((a, i) => (
                  <EditableSection key={i} value={a} onChange={(newA) => updateArrayItem("assumptions", i, newA)}>
                    <p className="text-sm text-[var(--ink-black)] before:content-['•'] before:mr-2 before:text-[#9A9590]">{a}</p>
                  </EditableSection>
                ))}
              </div>
            </section>
          )}

          {/* Sample Requirements */}
          {displayModel.sampleRequirements && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Sample Requirements
              </h3>
              <EditableSection value={displayModel.sampleRequirements} onChange={(v) => updateField("sampleRequirements", v)}>
                <p className="text-sm text-[var(--ink-black)] leading-relaxed">
                  {displayModel.sampleRequirements}
                </p>
              </EditableSection>
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
