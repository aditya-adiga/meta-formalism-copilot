"use client";

import { useState } from "react";
import type { CausalGraphResponse } from "@/app/lib/types/artifacts";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import ArtifactPanelShell from "./ArtifactPanelShell";
import CausalGraphView from "@/app/components/features/causal-graph/CausalGraphView";

type CausalGraphPanelProps = {
  causalGraph: CausalGraphResponse["causalGraph"] | null;
  /** Partial graph data from streaming (partial-JSON parsed) */
  streamingPreview?: CausalGraphResponse["causalGraph"] | null;
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
      {/* Summary */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
        <p className="text-sm text-[var(--ink-black)] leading-relaxed">{causalGraph.summary}</p>
      </section>

      {/* Variables */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
          Variables ({causalGraph.variables.length})
        </h3>
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
      </section>

      {/* Edges */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
          Causal Edges ({causalGraph.edges.length})
        </h3>
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
      </section>

      {/* Confounders */}
      {causalGraph.confounders.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
            Confounders ({causalGraph.confounders.length})
          </h3>
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
        </section>
      )}
    </>
  );
}

export default function CausalGraphPanel({ causalGraph, streamingPreview, loading, waitEstimate }: CausalGraphPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  // Show streaming preview during generation, final data when done
  const displayGraph = causalGraph ?? streamingPreview ?? null;
  const hasDisplayData = displayGraph !== null && (displayGraph.variables?.length ?? 0) > 0;

  return (
    <ArtifactPanelShell
      title="Causal Graph"
      loading={loading && !hasDisplayData}
      hasData={hasDisplayData}
      emptyMessage="No causal graph yet. Generate one from the source panel or node detail."
      loadingMessage={`Generating causal graph...${waitEstimate ? ` ${waitEstimate.remainingLabel}` : ""}`}
    >
      {hasDisplayData && displayGraph && (
        <div className="flex flex-col h-full">
          {/* View toggle */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setViewMode("graph")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "graph"
                  ? "bg-[var(--ink-black)] text-white"
                  : "bg-[#F5F1ED] text-[#6B6560] hover:bg-[#E8E4E0]"
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setViewMode("details")}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "details"
                  ? "bg-[var(--ink-black)] text-white"
                  : "bg-[#F5F1ED] text-[#6B6560] hover:bg-[#E8E4E0]"
              }`}
            >
              Details
            </button>
          </div>

          {viewMode === "graph" ? (
            <div className="flex-1 min-h-[400px]">
              <CausalGraphView causalGraph={displayGraph} />
            </div>
          ) : (
            <DetailsView causalGraph={displayGraph} />
          )}
        </div>
      )}
    </ArtifactPanelShell>
  );
}
