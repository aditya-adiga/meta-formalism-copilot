import type { ArtifactType } from "@/app/lib/types/session";
import type { ArtifactLoadingState } from "@/app/hooks/useArtifactGeneration";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";
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
  /** Custom artifact type support */
  customArtifactTypes?: CustomArtifactTypeDefinition[];
  onCreateCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onEditCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onDeleteCustomType?: (id: string) => void;
  /** Source text for the test preview in the designer */
  sourceText?: string;
  /** Source text character count, used for cost estimation tooltip. */
  sourceCharLength?: number;
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
  customArtifactTypes,
  onCreateCustomType,
  onEditCustomType,
  onDeleteCustomType,
  sourceText,
  sourceCharLength,
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4A4540]">
            Artifact Types
          </h3>
          <ArtifactChipSelector
            selected={selectedArtifactTypes}
            onChange={onArtifactTypesChange}
            loading={chipLoading}
            disabled={loading}
            customTypes={customArtifactTypes}
            onCreateCustomType={onCreateCustomType}
            onEditCustomType={onEditCustomType}
            onDeleteCustomType={onDeleteCustomType}
            sourceText={sourceText}
            contextText={contextText}
          />
        </div>
      </div>

      {/* Docked Formalise button */}
      <div className="shrink-0 border-t border-[#DDD9D5] px-4 py-3">
        <CostTooltip
          inputCharLength={(sourceCharLength ?? 0) + contextText.length}
          artifactTypes={selectedArtifactTypes}
        >
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || selectedArtifactTypes.length === 0}
            className="w-full rounded-full bg-[var(--ink-black)] px-6 py-3 text-base font-semibold text-white shadow-md transition-shadow duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
          >
            {buttonLabel}
          </button>
        </CostTooltip>
      </div>
    </div>
  );
}
