"use client";

import type { DialecticalMapResponse } from "@/app/lib/types/artifacts";

type DialecticalMapPanelProps = {
  dialecticalMap: DialecticalMapResponse["dialecticalMap"] | null;
  loading?: boolean;
};

export default function DialecticalMapPanel({ dialecticalMap, loading }: DialecticalMapPanelProps) {
  if (!dialecticalMap && !loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
        <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Dialectical Map
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590] px-8 text-center">
          No dialectical map yet. Generate one from the source panel or node detail.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
          Dialectical Map
        </h2>
      </div>

      {loading && !dialecticalMap ? (
        <div className="flex-1 px-8 py-10 text-sm text-[#6B6560]">
          Generating dialectical map...
        </div>
      ) : dialecticalMap ? (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Topic */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Topic</h3>
            <p className="text-sm font-medium text-[var(--ink-black)]">{dialecticalMap.topic}</p>
          </section>

          {/* Summary */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Summary</h3>
            <p className="text-sm text-[var(--ink-black)] leading-relaxed">{dialecticalMap.summary}</p>
          </section>

          {/* Perspectives */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
              Perspectives ({dialecticalMap.perspectives.length})
            </h3>
            <div className="space-y-3">
              {dialecticalMap.perspectives.map((p) => (
                <div key={p.id} className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#9A9590]">{p.id}</span>
                    <span className="text-sm font-medium text-[var(--ink-black)]">{p.label}</span>
                  </div>
                  <p className="text-xs text-[#6B6560]">{p.coreClaim}</p>

                  {p.supportingArguments.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-[#6B6560]">Supporting:</span>
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">
                        {p.supportingArguments.map((arg, i) => (
                          <li key={i} className="text-xs text-[#6B6560]">{arg}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {p.vulnerabilities.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-amber-700">Vulnerabilities:</span>
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">
                        {p.vulnerabilities.map((v, i) => (
                          <li key={i} className="text-xs text-amber-700">{v}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Tensions */}
          {dialecticalMap.tensions.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
                Tensions ({dialecticalMap.tensions.length})
              </h3>
              <div className="space-y-2">
                {dialecticalMap.tensions.map((t, i) => (
                  <div key={i} className="rounded border border-red-200 bg-red-50 px-3 py-2">
                    <div className="flex items-center gap-1 text-xs font-mono text-red-700">
                      <span>{t.between[0]}</span>
                      <span className="text-red-400">&harr;</span>
                      <span>{t.between[1]}</span>
                    </div>
                    <p className="mt-1 text-xs text-red-800">{t.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Synthesis */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Synthesis</h3>
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 space-y-2">
              <p className="text-sm text-green-900">{dialecticalMap.synthesis.equilibrium}</p>
              {dialecticalMap.synthesis.howAddressed.length > 0 && (
                <div className="space-y-1">
                  {dialecticalMap.synthesis.howAddressed.map((h) => (
                    <div key={h.perspectiveId} className="text-xs text-green-800">
                      <span className="font-mono font-semibold">{h.perspectiveId}:</span>{" "}
                      {h.resolution}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
