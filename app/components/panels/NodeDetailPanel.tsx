"use client";

import type { PropositionNode, NodeVerificationStatus } from "@/app/lib/types/decomposition";
import type { ArtifactType } from "@/app/lib/types/session";
import type { ArtifactLoadingState } from "@/app/hooks/useArtifactGeneration";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import FormalizationControls from "@/app/components/features/formalization-controls/FormalizationControls";

type NodeDetailPanelProps = {
  node: PropositionNode;
  /** Dependency nodes (resolved from dependsOn IDs) */
  dependencies: PropositionNode[];
  onFormalise: () => void;
  onGenerateLean: () => void;
  loading: boolean;
  /** Global context text, shown as placeholder when per-node context is empty */
  globalContextText: string;
  onNodeContextChange: (text: string) => void;
  onNodeArtifactTypesChange: (types: ArtifactType[]) => void;
  loadingState?: ArtifactLoadingState;
  waitEstimate?: WaitTimeEstimate | null;
};

const STATUS_LABELS: Record<NodeVerificationStatus, { text: string; color: string }> = {
  unverified: { text: "Unverified", color: "var(--status-unverified)" },
  "in-progress": { text: "In Progress", color: "var(--status-in-progress)" },
  verified: { text: "Verified", color: "var(--status-verified)" },
  failed: { text: "Failed", color: "var(--status-failed)" },
};

export default function NodeDetailPanel({
  node, dependencies, onFormalise, onGenerateLean, loading,
  globalContextText, onNodeContextChange, onNodeArtifactTypesChange, loadingState = {},
  waitEstimate,
}: NodeDetailPanelProps) {
  const status = STATUS_LABELS[node.verificationStatus];

  // Show the Lean generation button when semiformal exists but lean doesn't
  const showLeanButton = node.semiformalProof && !node.leanCode && node.verificationStatus === "unverified";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            {node.label}
          </h2>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
            style={{ backgroundColor: status.color }}
          >
            {status.text}
          </span>
        </div>
        <span className="rounded bg-[#F5F1ED] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#6B6560] border border-[#DDD9D5]">
          {node.kind}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {/* Node info section */}
        <div className="flex flex-col gap-4 p-6 pb-2">
          {/* Source Document */}
          {node.sourceLabel && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Source Document
              </h3>
              <div className="rounded-md border border-[#DDD9D5] bg-white px-4 py-2 text-sm text-[var(--ink-black)]">
                {node.sourceLabel}
              </div>
            </section>
          )}

          {/* Statement */}
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
              Statement
            </h3>
            <div className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-black)]">
              {node.statement}
            </div>
          </section>

          {/* Proof text */}
          {node.proofText && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Proof
              </h3>
              <div className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-black)]">
                {node.proofText}
              </div>
            </section>
          )}

          {/* Dependencies */}
          {dependencies.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Dependencies
              </h3>
              <div className="flex flex-col gap-1">
                {dependencies.map((dep) => {
                  const depStatus = STATUS_LABELS[dep.verificationStatus];
                  return (
                    <div key={dep.id} className="flex items-center gap-2 rounded-md border border-[#DDD9D5] bg-white px-3 py-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: depStatus.color }}
                      />
                      <span className="text-xs font-medium text-[var(--ink-black)]">{dep.label}</span>
                      <span className="text-[10px] text-[#9A9590]">{depStatus.text}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Semiformal proof (if generated) */}
          {node.semiformalProof && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Semiformal Proof
              </h3>
              <pre className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-black)] whitespace-pre-wrap">
                {node.semiformalProof}
              </pre>
            </section>
          )}

          {/* Lean code (if generated) */}
          {node.leanCode && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Lean4 Code
              </h3>
              <pre className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 font-mono text-sm leading-relaxed text-[var(--ink-black)] whitespace-pre-wrap">
                {node.leanCode}
              </pre>
            </section>
          )}

          {/* Verification errors */}
          {node.verificationErrors && (
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-800">
                Verification Errors
              </h3>
              <pre className="rounded-md border border-red-300 bg-red-50 px-4 py-3 font-mono text-xs leading-relaxed text-red-700 whitespace-pre-wrap">
                {node.verificationErrors}
              </pre>
            </section>
          )}

          {/* Separator between node info and formalization controls */}
          <div className="border-t border-[#DDD9D5]" />
        </div>

        {/* Lean generation button (when semiformal exists but lean doesn't) */}
        {showLeanButton && (
          <div className="shrink-0 px-4 pb-2">
            <button
              type="button"
              onClick={onGenerateLean}
              disabled={loading}
              className="relative w-full overflow-hidden rounded-full bg-[var(--ink-black)] px-6 py-2.5 text-sm font-medium text-white shadow-md transition-shadow duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
            >
              {loading && waitEstimate && (
                <span
                  className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${Math.round(waitEstimate.progress * 100)}%` }}
                />
              )}
              <span className="relative">
                {loading
                  ? waitEstimate
                    ? `Generating... ${waitEstimate.remainingLabel}`
                    : "Generating..."
                  : "Generate Lean4 Code"}
              </span>
            </button>
          </div>
        )}

        {/* Formalization controls: per-node context, artifact chips, Formalise button */}
        <FormalizationControls
          contextText={node.context}
          onContextChange={onNodeContextChange}
          selectedArtifactTypes={node.selectedArtifactTypes}
          onArtifactTypesChange={onNodeArtifactTypesChange}
          onGenerate={onFormalise}
          loading={loading}
          loadingState={loadingState}
          contextPlaceholder={globalContextText || "e.g., Explore this in the context of decision theory within game-theoretic settings..."}
          waitEstimate={waitEstimate}
        />
      </div>
    </div>
  );
}
