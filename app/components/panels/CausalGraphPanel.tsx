"use client";

import { useState } from "react";
import type { CausalGraphResponse } from "@/app/lib/types/artifacts";
import CollapsibleSection from "@/app/components/ui/CollapsibleSection";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import ArtifactPanelShell from "./ArtifactPanelShell";
import CausalGraphView from "@/app/components/features/causal-graph/CausalGraphView";

type CausalGraphPanelProps = {
  causalGraph: CausalGraphResponse["causalGraph"] | null;
  loading?: boolean;
  waitEstimate?: WaitTimeEstimate | null;
};

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

function DetailsView({ causalGraph }: { causalGraph: CausalGraphResponse["causalGraph"] }) {
  return (
    <>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
        <p className="text-sm text-[var(--ink-black)] leading-relaxed">{causalGraph.summary}</p>
      </section>

      <CollapsibleSection title="Variables" defaultOpen={false} count={causalGraph.variables.length}>
        <div className="space-y-2">
          {causalGraph.variables.map((v) => (
            <div key={v.id} className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#9A9590]">{v.id}</span>
                <span className="text-sm font-medium text-[var(--ink-black)]">{v.label}</span>
              </div>
              <p className="mt-1 text-xs text-[#6B6560]">{v.description}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Causal Edges" defaultOpen={false} count={causalGraph.edges.length}>
        <div className="space-y-2">
          {causalGraph.edges.map((e, i) => (
            <div key={`${e.from}-${e.to}-${i}`} className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs">{e.from}</span>
                <span className="text-[#9A9590]">&rarr;</span>
                <span className="font-mono text-xs">{e.to}</span>
                <WeightBadge weight={e.weight} />
              </div>
              <p className="mt-1 text-xs text-[#6B6560]">{e.mechanism}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {causalGraph.confounders.length > 0 && (
        <CollapsibleSection title="Confounders" defaultOpen={false} count={causalGraph.confounders.length}>
          <div className="space-y-2">
            {causalGraph.confounders.map((c) => (
              <div key={c.id} className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                <span className="text-sm font-medium text-amber-900">{c.label}</span>
                <p className="mt-1 text-xs text-amber-700">
                  Affects: {c.affectedEdges.join(", ")}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}

export default function CausalGraphPanel({ causalGraph, loading, waitEstimate }: CausalGraphPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  return (
    <ArtifactPanelShell
      title="Causal Graph"
      loading={loading}
      hasData={causalGraph !== null}
      emptyMessage="No causal graph yet. Generate one from the source panel or node detail."
      loadingMessage={`Generating causal graph...${waitEstimate ? ` ${waitEstimate.remainingLabel}` : ""}`}
    >
      {causalGraph && (
        <div className="flex flex-col h-full">
          <div className="sticky top-0 z-10 flex gap-1 mb-3 bg-[var(--ivory-cream)] pb-2">
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
          </div>

          {viewMode === "graph" ? (
            <div className="flex-1 min-h-[400px]">
              <CausalGraphView causalGraph={causalGraph} />
            </div>
          ) : (
            <DetailsView causalGraph={causalGraph} />
          )}
        </div>
      )}
    </ArtifactPanelShell>
  );
}
