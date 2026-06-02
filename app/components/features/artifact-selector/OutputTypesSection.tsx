import type { ArtifactType } from "@/app/lib/types/session";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";
import ArtifactChipSelector from "./ArtifactChipSelector";

/**
 * The "Output Types" subsection: a labeled chip group that selects which
 * artifact types (built-in and custom) a downstream action will generate.
 *
 * This is the single source of truth for the chip-picker UI. Anywhere a
 * user picks artifact types — direct formalization (InputPanel), per-node
 * formalization (NodeDetailPanel via FormalizationControls), batch
 * "Generate All" (GraphPanel), and any future surfaces — should render
 * this component rather than dropping in a bare ArtifactChipSelector. That
 * way custom-type wiring, headings, and styling stay consistent and
 * regressions like "custom types missing from view X" become impossible
 * by construction: there's only one place to forget the props.
 */
type OutputTypesSectionProps = {
  selected: ArtifactType[];
  onChange: (types: ArtifactType[]) => void;
  /** Per-chip loading state, used for inline spinners on running generations. */
  loading?: Partial<Record<ArtifactType, boolean>>;
  /** Disables all chips (e.g. while a generation is in flight). */
  disabled?: boolean;
  /** Custom artifact types defined in the current workspace. */
  customArtifactTypes?: CustomArtifactTypeDefinition[];
  onCreateCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onEditCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onDeleteCustomType?: (id: string) => void;
  /** Source text used by the custom-type designer's test-preview panel. */
  sourceText?: string;
  /** Context text used by the custom-type designer's test-preview panel. */
  contextText?: string;
  /**
   * Override the section heading. Defaults to "Output Types". Use sparingly —
   * the point of this abstraction is that the heading is the same everywhere.
   */
  heading?: string;
};

export default function OutputTypesSection({
  selected,
  onChange,
  loading,
  disabled,
  customArtifactTypes,
  onCreateCustomType,
  onEditCustomType,
  onDeleteCustomType,
  sourceText,
  contextText,
  heading = "Output Types",
}: OutputTypesSectionProps) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
        {heading}
      </h3>
      <ArtifactChipSelector
        selected={selected}
        onChange={onChange}
        loading={loading}
        disabled={disabled}
        customTypes={customArtifactTypes}
        onCreateCustomType={onCreateCustomType}
        onEditCustomType={onEditCustomType}
        onDeleteCustomType={onDeleteCustomType}
        sourceText={sourceText}
        contextText={contextText}
      />
    </div>
  );
}
