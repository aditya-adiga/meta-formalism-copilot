"use client";

import { useState, useCallback } from "react";
import type { CausalGraphResponse } from "@/app/lib/types/artifacts";
import CollapsibleSection from "@/app/components/ui/CollapsibleSection";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import { mergeStreamingPreview } from "@/app/lib/utils/mergeStreamingPreview";
import ArtifactPanelShell, { type ArtifactEditingProps } from "./ArtifactPanelShell";
import CausalGraphView from "@/app/components/features/causal-graph/CausalGraphView";
import EditableSection from "@/app/components/features/output-editing/EditableSection";
import { useFieldUpdaters } from "@/app/hooks/useFieldUpdaters";

type CausalGraphPanelProps = {
  causalGraph: CausalGraphResponse["causalGraph"] | null;
  /** Partial graph data from streaming (partial-JSON parsed) */
  streamingPreview?: CausalGraphResponse["causalGraph"] | null;
  loading?: boolean;
  waitEstimate?: WaitTimeEstimate | null;
  onContentChange?: (json: string) => void;
} & ArtifactEditingProps;

type ViewMode = "graph" | "details";

function WeightBadge({ weight }: { weight: number }) {
  const abs = Math.abs(weight);
  const color = weight >= 0 ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200";
  const label = weight >= 0 ? "+" : "";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-mono ${color}`}>
      {label}{weight.toFixed(2)} {abs > 0.7 ? "strong" : abs > 0.3 ? "moderate" : "weak"}
    </span>
  );
}

function DetailsView({
  causalGraph,
  onContentChange,
}: {
  causalGraph: CausalGraphResponse["causalGraph"];
  onContentChange?: (json: string) => void;
}) {
  const { updateField, updateArrayItem } = useFieldUpdaters(causalGraph, onContentChange);

  return (
    <>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
        <EditableSection value={causalGraph.summary} onChange={(v) => updateField("summary", v)}>
          <p className="text-sm text-[var(--ink-black)] leading-relaxed">{causalGraph.summary}</p>
        </EditableSection>
      </section>

      <CollapsibleSection title="Variables" defaultOpen={false} count={causalGraph.variables.length}>
        <div className="space-y-2">
          {causalGraph.variables.map((v, i) => (
            <EditableSection key={v.id} value={v} onChange={(newV) => updateArrayItem("variables", i, newV)}>
              <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#9A9590]">{v.id}</span>
                  <span className="text-sm font-medium text-[var(--ink-black)]">{v.label}</span>
                </div>
                <p className="mt-1 text-xs text-[#6B6560]">{v.description}</p>
              </div>
            </EditableSection>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Causal Edges" defaultOpen={false} count={causalGraph.edges.length}>
        <div className="space-y-2">
          {causalGraph.edges.map((e, i) => (
            <EditableSection key={`${e.from}-${e.to}-${i}`} value={e} onChange={(newE) => updateArrayItem("edges", i, newE)}>
              <div className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs">{e.from}</span>
                  <span className="text-[#9A9590]">&rarr;</span>
                  <span className="font-mono text-xs">{e.to}</span>
                  <WeightBadge weight={e.weight} />
                </div>
                <p className="mt-1 text-xs text-[#6B6560]">{e.mechanism}</p>
              </div>
            </EditableSection>
          ))}
        </div>
      </CollapsibleSection>

      {causalGraph.confounders.length > 0 && (
        <CollapsibleSection title="Confounders" defaultOpen={false} count={causalGraph.confounders.length}>
          <div className="space-y-2">
            {causalGraph.confounders.map((c, i) => (
              <EditableSection key={c.id} value={c} onChange={(newC) => updateArrayItem("confounders", i, newC)}>
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-sm font-medium text-amber-900">{c.label}</span>
                  <p className="mt-1 text-xs text-amber-700">
                    Affects: {c.affectedEdges.join(", ")}
                  </p>
                </div>
              </EditableSection>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}

export default function CausalGraphPanel({
  causalGraph, streamingPreview, loading, waitEstimate,
  onContentChange, onAiEdit, editing, editWaitEstimate,
}: CausalGraphPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  const { displayData: displayGraph, hasDisplayData } = mergeStreamingPreview(
    causalGraph, streamingPreview,
    (d) => (d.variables?.length ?? 0) > 0,
  );

  const handleAddVariable = useCallback(() => {
    if (!displayGraph || !onContentChange) return;
    const id = `var-${crypto.randomUUID().slice(0, 8)}`;
    const nextNum = displayGraph.variables.length + 1;
    const newVar = { id, label: `New factor ${nextNum}`, description: "" };
    onContentChange(JSON.stringify({ ...displayGraph, variables: [...displayGraph.variables, newVar] }));
  }, [displayGraph, onContentChange]);

  return (
    <ArtifactPanelShell
      title="Cause & Effect Map"
      loading={loading && !hasDisplayData}
      hasData={hasDisplayData}
      emptyMessage="No cause & effect map yet. Generate one from the Source panel or component detail."
      loadingMessage={`Generating cause & effect map...${waitEstimate ? ` ${waitEstimate.remainingLabel}` : ""}`}
      onAiEdit={onAiEdit}
      editing={editing}
      editWaitEstimate={editWaitEstimate}
    >
      {hasDisplayData && displayGraph && (
        <div className="flex flex-col h-full">
          <div className="sticky top-0 z-10 flex items-center gap-1 mb-3 bg-[var(--ivory-cream)] pb-2">
            {(["graph", "details"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  viewMode === mode
                    ? "bg-[var(--ink-black)] text-white"
                    : "bg-[#F5F1ED] text-[#6B6560] hover:bg-[#E8E4E0]"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
            {onContentChange && (
              <button
                onClick={handleAddVariable}
                className="ml-auto rounded-full border border-[#DDD9D5] bg-white px-3 py-1 text-xs font-medium text-[var(--ink-black)] shadow-sm hover:bg-[#F5F1ED]"
                title="Add a new factor to the graph"
              >
                + Factor
              </button>
            )}
          </div>

          {viewMode === "graph" ? (
            <div className="flex-1 min-h-[400px]">
              <CausalGraphView causalGraph={displayGraph} />
            </div>
          ) : (
            <DetailsView causalGraph={displayGraph} onContentChange={onContentChange} />
          )}
        </div>
      )}
    </ArtifactPanelShell>
  );
}
