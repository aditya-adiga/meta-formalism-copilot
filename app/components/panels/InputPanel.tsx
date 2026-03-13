import ContextInput from "@/app/components/features/context-input/ContextInput";
import FileUpload from "@/app/components/features/source-input/FileUpload";
import TextInput from "@/app/components/features/source-input/TextInput";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";

type InputPanelProps = {
  sourceText: string;
  onSourceTextChange: (value: string) => void;
  extractedFiles: { name: string; text: string }[];
  onFilesChanged: (files: { name: string; text: string }[]) => void;
  contextText: string;
  onContextTextChange: (value: string) => void;
  onFormalise: () => void;
  loading: boolean;
  waitEstimate?: WaitTimeEstimate | null;
};

export default function InputPanel({
  sourceText,
  onSourceTextChange,
  extractedFiles,
  onFilesChanged,
  contextText,
  onContextTextChange,
  onFormalise,
  loading,
  waitEstimate,
}: InputPanelProps) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Top Section: Source Inputs */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-[#DDD9D5]">
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Source Inputs
          </h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
          <TextInput value={sourceText} onChange={onSourceTextChange} />
          <FileUpload onFilesChanged={onFilesChanged} />

          {extractedFiles.length > 0 && (
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
          waitEstimate={waitEstimate}
        />
      </div>
    </div>
  );
}
