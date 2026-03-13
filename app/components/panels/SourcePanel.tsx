import TextInput from "@/app/components/features/source-input/TextInput";
import FileUpload from "@/app/components/features/source-input/FileUpload";

type SourcePanelProps = {
  sourceText: string;
  onSourceTextChange: (value: string) => void;
  onFilesChanged: (files: { name: string; text: string; file?: File }[]) => void;
  extractedFiles?: { name: string; text: string }[];
};

export default function SourcePanel({ sourceText, onSourceTextChange, onFilesChanged, extractedFiles }: SourcePanelProps) {
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

        {extractedFiles && extractedFiles.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
              Uploaded Documents
            </h3>
            <ul className="space-y-1">
              {extractedFiles.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center gap-2 rounded-md border border-[#E8E4E0] bg-white px-3 py-2 text-sm text-[var(--ink-black)] shadow-sm"
                >
                  <span className="text-green-600" aria-hidden>&#10003;</span>
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-[#9A9590]">
                    {f.text.length.toLocaleString()} chars
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
