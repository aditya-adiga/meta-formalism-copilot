import type { ArtifactType } from "@/app/lib/types/session";
import type { ArtifactLoadingState } from "@/app/hooks/useArtifactGeneration";
import ArtifactChipSelector from "@/app/components/features/artifact-selector/ArtifactChipSelector";
import CostTooltip from "@/app/components/ui/CostTooltip";

type FormalizationControlsProps = {
  contextText: string;
  onContextChange: (text: string) => void;
  selectedArtifactTypes: ArtifactType[];
  onArtifactTypesChange: (types: ArtifactType[]) => void;
  onGenerate: () => void;
  loading: boolean;
  loadingState?: ArtifactLoadingState;
  /** Placeholder text shown when contextText is empty (e.g. global context for per-node override) */
  contextPlaceholder?: string;
  /** Source text character length, used for cost estimation tooltip. */
  sourceText?: string;
};

export default function FormalizationControls({
  contextText,
  onContextChange,
  selectedArtifactTypes,
  onArtifactTypesChange,
  onGenerate,
  loading,
  loadingState = {},
  contextPlaceholder,
  sourceText,
}: FormalizationControlsProps) {
  // Derive per-chip loading booleans from loadingState
  const chipLoading: Partial<Record<ArtifactType, boolean>> = {};
  for (const [type, state] of Object.entries(loadingState)) {
    if (state === "generating") chipLoading[type as ArtifactType] = true;
  }

  const buttonLabel = loading
    ? "Formalising..."
    : selectedArtifactTypes.length > 1
      ? `Formalise \u2192 ${selectedArtifactTypes.length} artifacts`
      : "Formalise";

  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex flex-col gap-3 p-4">
        <textarea
          value={contextText}
          onChange={(e) => onContextChange(e.target.value)}
          placeholder={contextPlaceholder ?? "e.g., Explore this in the context of decision theory within game-theoretic settings..."}
          rows={6}
          className="resize-none rounded-md border border-[#DDD9D5] bg-white px-4 py-3 text-[var(--ink-black)] placeholder-[#9A9590] shadow-sm transition-shadow duration-200 focus:border-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] focus:shadow-md"
          style={{ lineHeight: 1.7, caretColor: "#000000" }}
        />

        {/* Artifact type chips */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
            Artifact Types
          </h3>
          <ArtifactChipSelector
            selected={selectedArtifactTypes}
            onChange={onArtifactTypesChange}
            loading={chipLoading}
            disabled={loading}
          />
        </div>
      </div>

      {/* Docked Formalise button */}
      <div className="shrink-0 border-t border-[#DDD9D5] px-4 py-3">
        <CostTooltip
          inputCharLength={(sourceText?.length ?? 0) + contextText.length}
          artifactTypes={selectedArtifactTypes}
        >
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || selectedArtifactTypes.length === 0}
            className="w-full rounded-full bg-[var(--ink-black)] px-6 py-2.5 text-sm font-medium text-white shadow-md transition-shadow duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
          >
            {buttonLabel}
          </button>
        </CostTooltip>
      </div>
    </div>
  );
}
