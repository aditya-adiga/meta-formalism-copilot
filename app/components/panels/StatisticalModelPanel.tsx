"use client";

import type { StatisticalModelResponse } from "@/app/lib/types/artifacts";
import { mergeStreamingPreview } from "@/app/lib/utils/mergeStreamingPreview";
import ArtifactPanelShell from "./ArtifactPanelShell";

type StatisticalModelPanelProps = {
  statisticalModel: StatisticalModelResponse["statisticalModel"] | null;
  /** Partial model data from streaming (partial-JSON parsed) */
  streamingPreview?: StatisticalModelResponse["statisticalModel"] | null;
  loading?: boolean;
};

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

export default function StatisticalModelPanel({ statisticalModel, streamingPreview, loading }: StatisticalModelPanelProps) {
  const { displayData: displayModel, hasDisplayData } = mergeStreamingPreview(
    statisticalModel, streamingPreview,
    (d) => (d.variables?.length ?? 0) > 0,
  );

  return (
    <ArtifactPanelShell
      title="Statistical Model"
      loading={loading && !hasDisplayData}
      hasData={hasDisplayData}
      emptyMessage="No statistical model yet. Generate one from the Source panel or component detail."
      loadingMessage="Generating statistical model..."
    >
      {hasDisplayData && displayModel && (
        <>
          {/* Summary */}
          {displayModel.summary && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <p className="text-sm text-[var(--ink-black)] leading-relaxed">{displayModel.summary}</p>
          </section>
          )}

          {/* Variables */}
          {(displayModel.variables?.length ?? 0) > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Factors ({displayModel.variables.length})
            </h3>
            <div className="space-y-2">
              {displayModel.variables.map((v) => (
                <div key={v.id} className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#9A9590]">{v.id}</span>
                    <span className="text-sm font-medium text-[var(--ink-black)]">{v.label}</span>
                    <RoleBadge role={v.role} />
                  </div>
                  {v.distribution && (
                    <p className="mt-1 text-xs text-[#6B6560]">Distribution: {v.distribution}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Hypotheses */}
          {(displayModel.hypotheses?.length ?? 0) > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Predictions ({displayModel.hypotheses.length})
            </h3>
            <div className="space-y-2">
              {displayModel.hypotheses.map((h) => (
                <div key={h.id} className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                  <p className="text-sm font-medium text-[var(--ink-black)]">{h.statement}</p>
                  <p className="mt-1 text-xs text-[#6B6560]">
                    <span className="font-semibold">Baseline assumption:</span> {h.nullHypothesis}
                  </p>
                  <p className="mt-1 text-xs text-[#9A9590]">
                    <span className="font-semibold">Suggested test:</span> {h.testSuggestion}
                  </p>
                </div>
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
              <ul className="list-disc pl-5 space-y-1">
                {displayModel.assumptions.map((a, i) => (
                  <li key={i} className="text-sm text-[var(--ink-black)]">{a}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Sample Requirements */}
          {displayModel.sampleRequirements && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Data Needed
              </h3>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed">
                {displayModel.sampleRequirements}
              </p>
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
