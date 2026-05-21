"use client";

import type { DialecticalMapResponse } from "@/app/lib/types/artifacts";
import { mergeStreamingPreview } from "@/app/lib/utils/mergeStreamingPreview";
import ArtifactPanelShell, { type ArtifactEditingProps, type StalenessProps } from "./ArtifactPanelShell";
import EditableSection from "@/app/components/features/output-editing/EditableSection";
import CollapsibleSection from "@/app/components/ui/CollapsibleSection";
import { useFieldUpdaters } from "@/app/hooks/useFieldUpdaters";

type DialecticalMapPanelProps = {
  dialecticalMap: DialecticalMapResponse["dialecticalMap"] | null;
  /** Partial map data from streaming (partial-JSON parsed) */
  streamingPreview?: DialecticalMapResponse["dialecticalMap"] | null;
  loading?: boolean;
  onContentChange?: (json: string) => void;
} & ArtifactEditingProps & StalenessProps;

export default function DialecticalMapPanel({
  dialecticalMap, streamingPreview, loading,
  onContentChange, onAiEdit, editing, editWaitEstimate,
  isStale, onRegenerate,
}: DialecticalMapPanelProps) {
  const { updateField, updateArrayItem } = useFieldUpdaters(dialecticalMap, onContentChange);

  const { displayData: displayMap, hasDisplayData } = mergeStreamingPreview(
    dialecticalMap, streamingPreview,
    (d) => (d.perspectives?.length ?? 0) > 0 || !!d.topic,
  );

  return (
    <ArtifactPanelShell
      title="Dialectical Map"
      loading={loading && !hasDisplayData}
      hasData={hasDisplayData}
      emptyMessage="No dialectical map yet. Generate one from the source panel or node detail."
      loadingMessage="Generating dialectical map..."
      onAiEdit={onAiEdit}
      editing={editing}
      editWaitEstimate={editWaitEstimate}
      isStale={isStale}
      onRegenerate={onRegenerate}
    >
      {hasDisplayData && displayMap && (
        <>
          {/* Topic */}
          {displayMap.topic && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Topic</h3>
            <EditableSection value={displayMap.topic} onChange={(v) => updateField("topic", v)}>
              <p className="text-sm font-medium text-[var(--ink-black)]">{displayMap.topic}</p>
            </EditableSection>
          </section>
          )}

          {/* Summary */}
          {displayMap.summary && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <EditableSection value={displayMap.summary} onChange={(v) => updateField("summary", v)}>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">{displayMap.summary}</p>
            </EditableSection>
          </section>
          )}

          {/* Perspectives */}
          {(displayMap.perspectives?.length ?? 0) > 0 && (
          <CollapsibleSection title="Perspectives" defaultOpen={false} count={displayMap.perspectives?.length ?? 0}>
            <div className="space-y-3">
              {displayMap.perspectives?.map((p, i) => (
                <EditableSection key={p.id} value={p} onChange={(newP) => updateArrayItem("perspectives", i, newP)}>
                  <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[#9A9590]">{p.id}</span>
                      <span className="text-sm font-medium text-[var(--ink-black)]">{p.label}</span>
                    </div>
                    <p className="text-xs text-[#6B6560]">{p.coreClaim}</p>

                    {(p.supportingArguments?.length ?? 0) > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-[#6B6560]">Supporting:</span>
                        <ul className="list-disc pl-5 mt-1 space-y-0.5">
                          {p.supportingArguments?.map((arg, j) => (
                            <li key={j} className="text-xs text-[#6B6560]">{arg}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(p.vulnerabilities?.length ?? 0) > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-amber-700">Vulnerabilities:</span>
                        <ul className="list-disc pl-5 mt-1 space-y-0.5">
                          {p.vulnerabilities?.map((v, j) => (
                            <li key={j} className="text-xs text-amber-700">{v}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </EditableSection>
              ))}
            </div>
          </CollapsibleSection>
          )}

          {/* Tensions */}
          {(displayMap.tensions?.length ?? 0) > 0 && (
            <CollapsibleSection title="Tensions" defaultOpen={false} count={displayMap.tensions?.length ?? 0}>
              <div className="space-y-2">
                {displayMap.tensions?.map((t, i) => (
                  <EditableSection key={i} value={t} onChange={(newT) => updateArrayItem("tensions", i, newT)}>
                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
                      <div className="flex items-center gap-1 text-xs font-mono text-red-700">
                        <span>{t.between[0]}</span>
                        <span className="text-red-400">&harr;</span>
                        <span>{t.between[1]}</span>
                      </div>
                      <p className="mt-1 text-xs text-red-800">{t.description}</p>
                    </div>
                  </EditableSection>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Synthesis */}
          {displayMap.synthesis && (
          <CollapsibleSection title="Synthesis" defaultOpen={false}>
            <EditableSection value={displayMap.synthesis} onChange={(v) => updateField("synthesis", v)}>
              <div className="rounded border border-green-200 bg-green-50 px-3 py-2 space-y-2">
                <p className="text-sm text-green-900">{displayMap.synthesis.equilibrium}</p>
                {(displayMap.synthesis.howAddressed?.length ?? 0) > 0 && (
                  <div className="space-y-1">
                    {displayMap.synthesis.howAddressed?.map((h) => (
                      <div key={h.perspectiveId} className="text-xs text-green-800">
                        <span className="font-mono font-semibold">{h.perspectiveId}:</span>{" "}
                        {h.resolution}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </EditableSection>
          </CollapsibleSection>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
