"use client";

import type { PropertyTestsResponse } from "@/app/lib/types/artifacts";
import ArtifactPanelShell, { type ArtifactEditingProps } from "./ArtifactPanelShell";
import EditableSection from "@/app/components/features/output-editing/EditableSection";
import { useFieldUpdaters } from "@/app/hooks/useFieldUpdaters";

type PropertyTestsPanelProps = {
  propertyTests: PropertyTestsResponse["propertyTests"] | null;
  loading?: boolean;
  onContentChange?: (json: string) => void;
} & ArtifactEditingProps;

export default function PropertyTestsPanel({
  propertyTests, loading,
  onContentChange, onAiEdit, editing, editWaitEstimate,
}: PropertyTestsPanelProps) {
  const { updateField, updateArrayItem } = useFieldUpdaters(propertyTests, onContentChange);

  return (
    <ArtifactPanelShell
      title="Property Tests"
      loading={loading}
      hasData={propertyTests !== null}
      emptyMessage="No property tests yet. Generate them from the source panel or node detail."
      loadingMessage="Generating property tests..."
      onAiEdit={onAiEdit}
      editing={editing}
      editWaitEstimate={editWaitEstimate}
    >
      {propertyTests && (
        <>
          {/* Summary */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <EditableSection value={propertyTests.summary} onChange={(v) => updateField("summary", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">{propertyTests.summary}</p>
            </EditableSection>
          </section>

          {/* Properties */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Properties ({propertyTests.properties.length})
            </h3>
            <div className="space-y-3">
              {propertyTests.properties.map((p, i) => (
                <EditableSection key={p.id} value={p} onChange={(newP) => updateArrayItem("properties", i, newP)}>
                  <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#9A9590]">{p.id}</span>
                      <span className="text-sm font-medium text-[var(--ink-black)]">{p.name}</span>
                    </div>
                    <p className="text-xs text-[#6B6560]">{p.description}</p>
                    <div className="text-xs text-[#6B6560]">
                      <span className="font-semibold">Pre:</span> {p.preconditions}
                    </div>
                    <div className="text-xs text-[#6B6560]">
                      <span className="font-semibold">Post:</span> {p.postcondition}
                    </div>
                    <pre className="rounded bg-[#F5F1ED] px-3 py-2 text-xs font-mono text-[var(--ink-black)] overflow-x-auto whitespace-pre-wrap">
                      {p.pseudocode}
                    </pre>
                  </div>
                </EditableSection>
              ))}
            </div>
          </section>

          {/* Data Generators */}
          {propertyTests.dataGenerators.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Data Generators ({propertyTests.dataGenerators.length})
              </h3>
              <div className="space-y-2">
                {propertyTests.dataGenerators.map((g, i) => (
                  <EditableSection key={i} value={g} onChange={(newG) => updateArrayItem("dataGenerators", i, newG)}>
                    <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                      <span className="text-sm font-medium text-[var(--ink-black)]">{g.name}</span>
                      <p className="mt-1 text-xs text-[#6B6560]">{g.description}</p>
                      <p className="mt-1 text-xs text-[#9A9590]">
                        <span className="font-semibold">Constraints:</span> {g.constraints}
                      </p>
                    </div>
                  </EditableSection>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
