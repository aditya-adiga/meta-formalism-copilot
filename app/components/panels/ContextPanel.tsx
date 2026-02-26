import ContextInput from "@/app/components/features/context-input/ContextInput";

type ContextPanelProps = {
  contextText: string;
  onContextTextChange: (value: string) => void;
  onFormalise: () => void;
  loading: boolean;
};

export default function ContextPanel({ contextText, onContextTextChange, onFormalise, loading }: ContextPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
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
  );
}
