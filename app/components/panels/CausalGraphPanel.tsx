"use client";

import type { CausalGraphResponse } from "@/app/lib/types/artifacts";

type CausalGraphPanelProps = {
  causalGraph: CausalGraphResponse["causalGraph"] | null;
  loading?: boolean;
};

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

export default function CausalGraphPanel({ causalGraph, loading }: CausalGraphPanelProps) {
  if (!causalGraph && !loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
        <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Causal Graph
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590] px-8 text-center">
          No causal graph yet. Generate one from the source panel or node detail.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
          Causal Graph
        </h2>
      </div>

      {loading && !causalGraph ? (
        <div className="flex-1 px-8 py-10 text-sm text-[#6B6560]">
          Generating causal graph...
        </div>
      ) : causalGraph ? (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
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
        </div>
      ) : null}
    </div>
  );
}
