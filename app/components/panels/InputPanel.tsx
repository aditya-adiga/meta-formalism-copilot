import ContextInput from "@/app/components/features/context-input/ContextInput";
import FileUpload from "@/app/components/features/source-input/FileUpload";
import TextInput from "@/app/components/features/source-input/TextInput";

type InputPanelProps = {
  sourceText: string;
  onSourceTextChange: (value: string) => void;
  contextText: string;
  onContextTextChange: (value: string) => void;
  onFormalise: () => void;
  loading: boolean;
  onFilesChanged: (files: { name: string; text: string }[]) => void;
};

export default function InputPanel({
  sourceText,
  onSourceTextChange,
  contextText,
  onContextTextChange,
  onFormalise,
  loading,
  onFilesChanged,
}: InputPanelProps) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Top Section: Source Inputs */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b-2 border-[var(--ink-black)]">
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Source Inputs
          </h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
          <TextInput value={sourceText} onChange={onSourceTextChange} />
          <FileUpload onFilesChanged={onFilesChanged} />
        </div>
      </div>

      {/* Bottom Section: Formalism Context */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Formalism Context
          </h2>
        </div>
        <ContextInput
          value={contextText}
          onChange={onContextTextChange}
          onFormalise={onFormalise}
          loading={loading}
        />
      </div>
    </div>
  );
}
