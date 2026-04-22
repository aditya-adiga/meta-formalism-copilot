import type { ArtifactType } from "@/app/lib/types/session";
import type { ArtifactLoadingState } from "@/app/hooks/useArtifactGeneration";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";
import FileUpload from "@/app/components/features/source-input/FileUpload";
import TextInput from "@/app/components/features/source-input/TextInput";
import FormalizationControls from "@/app/components/features/formalization-controls/FormalizationControls";

type InputPanelProps = {
  sourceText: string;
  onSourceTextChange: (value: string) => void;
  onFilesChanged: (files: { name: string; text: string }[]) => void;
  existingFiles?: { name: string; text: string }[];
  contextText: string;
  onContextTextChange: (value: string) => void;
  onFormalise: () => void;
  loading: boolean;
  /** Decompose source into proposition nodes */
  onDecompose?: (options?: { forceLlm?: boolean }) => void;
  decomposing?: boolean;
  /** Artifact type selection */
  selectedArtifactTypes: ArtifactType[];
  onArtifactTypesChange: (types: ArtifactType[]) => void;
  loadingState?: ArtifactLoadingState;
  waitEstimate?: WaitTimeEstimate | null;
  /** Custom artifact type support */
  customArtifactTypes?: CustomArtifactTypeDefinition[];
  onCreateCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onEditCustomType?: (def: CustomArtifactTypeDefinition) => void;
  onDeleteCustomType?: (id: string) => void;
};

export default function InputPanel({
  sourceText,
  onSourceTextChange,
  onFilesChanged,
  existingFiles,
  contextText,
  onContextTextChange,
  onFormalise,
  loading,
  onDecompose,
  decomposing = false,
  selectedArtifactTypes,
  onArtifactTypesChange,
  loadingState,
  // waitEstimate available via props for future use
  customArtifactTypes,
  onCreateCustomType,
  onEditCustomType,
  onDeleteCustomType,
}: InputPanelProps) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Top Section: Source Inputs */}
      <div className="flex max-h-[50%] min-h-0 flex-col overflow-hidden border-b border-[#DDD9D5]">
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-4 py-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Source Inputs
          </h2>
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
          <TextInput value={sourceText} onChange={onSourceTextChange} />
          <FileUpload onFilesChanged={onFilesChanged} existingFiles={existingFiles} />

          {/* Decompose action */}
          {onDecompose && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onDecompose?.()}
                disabled={decomposing || loading}
                className="w-full rounded-full border border-[var(--ink-black)] bg-transparent px-6 py-2.5 text-sm font-medium text-[var(--ink-black)] shadow-sm transition-all duration-200 hover:bg-[var(--ink-black)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)] disabled:opacity-50"
              >
                {decomposing ? "Decomposing..." : "Decompose into nodes"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Context + Artifact Selection + Formalise */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-4 py-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Direct Formalization
          </h2>
        </div>
        <FormalizationControls
          contextText={contextText}
          onContextChange={onContextTextChange}
          selectedArtifactTypes={selectedArtifactTypes}
          onArtifactTypesChange={onArtifactTypesChange}
          onGenerate={onFormalise}
          loading={loading}
          loadingState={loadingState}
          customArtifactTypes={customArtifactTypes}
          onCreateCustomType={onCreateCustomType}
          onEditCustomType={onEditCustomType}
          onDeleteCustomType={onDeleteCustomType}
          sourceText={sourceText}
        />
      </div>
    </div>
  );
}
