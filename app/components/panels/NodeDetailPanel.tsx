"use client";

import type { PropositionNode, NodeVerificationStatus, NodeArtifact } from "@/app/lib/types/decomposition";
import type { ArtifactType, BuiltinArtifactType } from "@/app/lib/types/session";
import type { ArtifactLoadingState } from "@/app/hooks/useArtifactGeneration";
import { ARTIFACT_META } from "@/app/lib/types/artifacts";
import { isCustomType } from "@/app/lib/types/customArtifact";
import FormalizationControls from "@/app/components/features/formalization-controls/FormalizationControls";
import CollapsibleSection from "@/app/components/ui/CollapsibleSection";

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
};

const STATUS_LABELS: Record<NodeVerificationStatus, { text: string; color: string }> = {
  unverified: { text: "Not checked", color: "var(--status-unverified)" },
  "in-progress": { text: "In Progress", color: "var(--status-in-progress)" },
  verified: { text: "Passed", color: "var(--status-verified)" },
  failed: { text: "Failed", color: "var(--status-failed)" },
};

/** Renders a single non-deductive artifact stored on a node */
function NodeArtifactSection({ artifact }: { artifact: NodeArtifact }) {
  const meta = isCustomType(artifact.type) ? null : ARTIFACT_META[artifact.type as BuiltinArtifactType];
  // Try to pretty-print JSON content; fall back to raw string
  let display: string;
  try {
    const parsed = JSON.parse(artifact.content);
    display = JSON.stringify(parsed, null, 2);
  } catch {
    display = artifact.content;
  }

  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
          {meta?.label ?? artifact.type}
        </h3>
        {artifact.verificationStatus !== "unverified" && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
            style={{ backgroundColor: STATUS_LABELS[artifact.verificationStatus].color }}
          >
            {STATUS_LABELS[artifact.verificationStatus].text}
          </span>
        )}
      </div>
      <pre className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 font-mono text-sm leading-relaxed text-[var(--ink-black)] whitespace-pre-wrap max-h-80 overflow-auto">
        {display}
      </pre>
      {artifact.verificationErrors && (
        <pre className="mt-1 rounded-md border border-red-300 bg-red-50 px-4 py-2 font-mono text-xs leading-relaxed text-red-700 whitespace-pre-wrap">
          {artifact.verificationErrors}
        </pre>
      )}
    </section>
  );
}

export default function NodeDetailPanel({
  node, dependencies, onFormalise, onGenerateLean, loading,
  globalContextText, onNodeContextChange, onNodeArtifactTypesChange, loadingState = {},
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Scrollable node info section */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="flex flex-col gap-4 pt-6 px-6 pb-2">
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

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
                Statement
              </h3>
              <div className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-black)]">
                {node.statement}
              </div>
            </section>

            {node.proofText && (
              <CollapsibleSection title="Proof" defaultOpen={false}>
                <div className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-black)]">
                  {node.proofText}
                </div>
              </CollapsibleSection>
            )}

            {dependencies.length > 0 && (
              <CollapsibleSection title="Depends On" count={dependencies.length} defaultOpen={false}>
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
              </CollapsibleSection>
            )}

            {node.semiformalProof && (
              <CollapsibleSection title="Step-by-Step Proof">
                <pre className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--ink-black)] whitespace-pre-wrap">
                  {node.semiformalProof}
                </pre>
              </CollapsibleSection>
            )}

            {node.leanCode && (
              <CollapsibleSection title="Proof Code">
                <pre className="rounded-md border border-[#DDD9D5] bg-white px-4 py-3 font-mono text-sm leading-relaxed text-[var(--ink-black)] whitespace-pre-wrap">
                  {node.leanCode}
                </pre>
              </CollapsibleSection>
            )}

            {node.verificationErrors && (
              <CollapsibleSection title="Errors Found" variant="error" defaultOpen={false}>
                <pre className="rounded-md border border-red-300 bg-red-50 px-4 py-3 font-mono text-xs leading-relaxed text-red-700 whitespace-pre-wrap">
                  {node.verificationErrors}
                </pre>
              </CollapsibleSection>
            )}

            {/* Non-deductive artifacts (property-tests, causal-graph, etc.) */}
            {node.artifacts.length > 0 && node.artifacts.map((artifact) => (
              <NodeArtifactSection key={artifact.type} artifact={artifact} />
            ))}
          </div>
        </div>

        {/* Docked controls — outside scroll container */}
        <div className="shrink-0 border-t border-[#DDD9D5]">
          {showLeanButton && (
            <div className="px-4 py-2">
              <button
                type="button"
                onClick={onGenerateLean}
                disabled={loading}
                className="w-full rounded-full bg-[var(--ink-black)] px-6 py-2.5 text-sm font-medium text-white shadow-md transition-shadow duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Proof Code"}
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
            contextPlaceholder={globalContextText || "e.g., Analyze this from a decision-making perspective, considering strategic interactions between actors..."}
          />
        </div>
      </div>
    </div>
  );
}
