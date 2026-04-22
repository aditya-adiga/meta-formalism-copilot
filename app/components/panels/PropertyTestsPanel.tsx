"use client";

import type { PropertyTestsResponse } from "@/app/lib/types/artifacts";
import { mergeStreamingPreview } from "@/app/lib/utils/mergeStreamingPreview";
import ArtifactPanelShell, { type ArtifactEditingProps } from "./ArtifactPanelShell";
import EditableSection from "@/app/components/features/output-editing/EditableSection";
import { useFieldUpdaters } from "@/app/hooks/useFieldUpdaters";

type PropertyTestsPanelProps = {
  propertyTests: PropertyTestsResponse["propertyTests"] | null;
  /** Partial data from streaming (partial-JSON parsed) */
  streamingPreview?: PropertyTestsResponse["propertyTests"] | null;
  loading?: boolean;
  onContentChange?: (json: string) => void;
} & ArtifactEditingProps;

export default function PropertyTestsPanel({
  propertyTests, streamingPreview, loading,
  onContentChange, onAiEdit, editing, editWaitEstimate,
}: PropertyTestsPanelProps) {
  const { updateField, updateArrayItem } = useFieldUpdaters(propertyTests, onContentChange);

  const { displayData, hasDisplayData } = mergeStreamingPreview(
    propertyTests, streamingPreview,
    (d) => (d.properties?.length ?? 0) > 0,
  );

  return (
    <ArtifactPanelShell
      title="Consistency Checks"
      loading={loading && !hasDisplayData}
      hasData={hasDisplayData}
      emptyMessage="No consistency checks yet. Generate them from the Source panel or component detail."
      loadingMessage="Generating consistency checks..."
      onAiEdit={onAiEdit}
      editing={editing}
      editWaitEstimate={editWaitEstimate}
    >
      {hasDisplayData && displayData && (
        <>
          {/* Summary */}
          {displayData.summary && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <EditableSection value={displayData.summary} onChange={(v) => updateField("summary", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">{displayData.summary}</p>
            </EditableSection>
          </section>
          )}

          {/* Properties */}
          {(displayData.properties?.length ?? 0) > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Rules ({displayData.properties.length})
            </h3>
            <div className="space-y-3">
              {displayData.properties.map((p, i) => (
                <EditableSection key={p.id} value={p} onChange={(newP) => updateArrayItem("properties", i, newP)}>
                  <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#9A9590]">{p.id}</span>
                      <span className="text-sm font-medium text-[var(--ink-black)]">{p.name}</span>
                    </div>
                    <p className="text-xs text-[#6B6560]">{p.description}</p>
                    <div className="text-xs text-[#6B6560]">
                      <span className="font-semibold">Requires:</span> {p.preconditions}
                    </div>
                    <div className="text-xs text-[#6B6560]">
                      <span className="font-semibold">Guarantees:</span> {p.postcondition}
                    </div>
                    <pre className="rounded bg-[#F5F1ED] px-3 py-2 text-xs font-mono text-[var(--ink-black)] overflow-x-auto whitespace-pre-wrap">
                      {p.pseudocode}
                    </pre>
                  </div>
                </EditableSection>
              ))}
            </div>
          </section>
          )}

          {/* Data Generators */}
          {(displayData.dataGenerators?.length ?? 0) > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Test Data ({displayData.dataGenerators.length})
              </h3>
              <div className="space-y-2">
                {displayData.dataGenerators.map((g, i) => (
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
