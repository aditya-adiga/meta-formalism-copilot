"use client";

import type { PropertyTestsResponse } from "@/app/lib/types/artifacts";
import ArtifactPanelShell from "./ArtifactPanelShell";

type PropertyTestsPanelProps = {
  propertyTests: PropertyTestsResponse["propertyTests"] | null;
  loading?: boolean;
};

export default function PropertyTestsPanel({ propertyTests, loading }: PropertyTestsPanelProps) {
  return (
    <ArtifactPanelShell
      title="Consistency Checks"
      loading={loading}
      hasData={propertyTests !== null}
      emptyMessage="No consistency checks yet. Generate them from the Source panel or component detail."
      loadingMessage="Generating consistency checks..."
    >
      {propertyTests && (
        <>
          {/* Summary */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <p className="text-sm text-[var(--ink-black)] leading-relaxed">{propertyTests.summary}</p>
          </section>

          {/* Properties */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Rules ({propertyTests.properties.length})
            </h3>
            <div className="space-y-3">
              {propertyTests.properties.map((p) => (
                <div key={p.id} className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-2">
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
              ))}
            </div>
          </section>

          {/* Data Generators */}
          {propertyTests.dataGenerators.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Test Data ({propertyTests.dataGenerators.length})
              </h3>
              <div className="space-y-2">
                {propertyTests.dataGenerators.map((g, i) => (
                  <div key={i} className="rounded border border-[#DDD9D5] bg-white px-3 py-2">
                    <span className="text-sm font-medium text-[var(--ink-black)]">{g.name}</span>
                    <p className="mt-1 text-xs text-[#6B6560]">{g.description}</p>
                    <p className="mt-1 text-xs text-[#9A9590]">
                      <span className="font-semibold">Constraints:</span> {g.constraints}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
