"use client";

import type { StatisticalModelResponse } from "@/app/lib/types/artifacts";
import ArtifactPanelShell, { type ArtifactEditingProps } from "./ArtifactPanelShell";
import EditableSection from "@/app/components/features/output-editing/EditableSection";

type StatisticalModelPanelProps = {
  statisticalModel: StatisticalModelResponse["statisticalModel"] | null;
  loading?: boolean;
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
  statisticalModel, loading,
  onContentChange, onAiEdit, editing, editWaitEstimate,
}: StatisticalModelPanelProps) {
  // Helper to update a field and persist
  const updateField = (key: string, value: unknown) => {
    if (!statisticalModel || !onContentChange) return;
    onContentChange(JSON.stringify({ ...statisticalModel, [key]: value }));
  };

  const updateArrayItem = (key: string, index: number, value: unknown) => {
    if (!statisticalModel || !onContentChange) return;
    const arr = [...((statisticalModel as unknown as Record<string, unknown[]>)[key])];
    arr[index] = value;
    onContentChange(JSON.stringify({ ...statisticalModel, [key]: arr }));
  };

  return (
    <ArtifactPanelShell
      title="Statistical Model"
      loading={loading}
      hasData={statisticalModel !== null}
      emptyMessage="No statistical model yet. Generate one from the source panel or node detail."
      loadingMessage="Generating statistical model..."
      onAiEdit={onAiEdit}
      editing={editing}
      editWaitEstimate={editWaitEstimate}
    >
      {statisticalModel && (
        <>
          {/* Summary */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <EditableSection value={statisticalModel.summary} onChange={(v) => updateField("summary", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">{statisticalModel.summary}</p>
            </EditableSection>
          </section>

          {/* Variables */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Variables ({statisticalModel.variables.length})
            </h3>
            <div className="space-y-2">
              {statisticalModel.variables.map((v, i) => (
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

          {/* Hypotheses */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Hypotheses ({statisticalModel.hypotheses.length})
            </h3>
            <div className="space-y-2">
              {statisticalModel.hypotheses.map((h, i) => (
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

          {/* Assumptions */}
          {statisticalModel.assumptions.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Assumptions ({statisticalModel.assumptions.length})
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                {statisticalModel.assumptions.map((a, i) => (
                  <EditableSection key={i} value={a} onChange={(newA) => updateArrayItem("assumptions", i, newA)}>
                    <li className="text-sm text-[var(--ink-black)]">{a}</li>
                  </EditableSection>
                ))}
              </ul>
            </section>
          )}

          {/* Sample Requirements */}
          {statisticalModel.sampleRequirements && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Sample Requirements
              </h3>
              <EditableSection value={statisticalModel.sampleRequirements} onChange={(v) => updateField("sampleRequirements", v)}>
                <p className="text-sm text-[var(--ink-black)] leading-relaxed">
                  {statisticalModel.sampleRequirements}
                </p>
              </EditableSection>
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
