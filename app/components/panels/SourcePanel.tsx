import TextInput from "@/app/components/features/source-input/TextInput";
import FileUpload from "@/app/components/features/source-input/FileUpload";

type SourcePanelProps = {
  sourceText: string;
  onSourceTextChange: (value: string) => void;
  onFilesChanged: (files: { name: string; text: string; file?: File }[]) => void;
};

export default function SourcePanel({ sourceText, onSourceTextChange, onFilesChanged }: SourcePanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
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
  );
}
