type RefinementPreviewProps = {
  originalText: string;
  refinedText: string;
  onInsert: () => void;
  onCancel: () => void;
};

export default function RefinementPreview({
  originalText,
  refinedText,
  onInsert,
  onCancel,
}: RefinementPreviewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-6">
      <p className="shrink-0 text-xs text-[#6B6560]">Review the refined context</p>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {/* Original - Top Half */}
        <div className="relative flex min-h-0 flex-1 flex-col rounded-md border border-[#DDD9D5] bg-[#F5F1ED] p-3 shadow-sm">
          <span className="mb-1 text-xs font-medium text-[#6B6560]">Original</span>
          <div
            className="min-h-0 flex-1 overflow-auto text-sm text-[var(--ink-black)]"
            style={{ lineHeight: 1.6 }}
          >
            {originalText}
          </div>
        </div>

        {/* Refined - Bottom Half */}
        <div className="relative flex min-h-0 flex-1 flex-col rounded-md border border-[#DDD9D5] bg-white p-3 shadow-sm">
          <span className="mb-1 text-xs font-medium text-[#6B6560]">Refined</span>
          <div
            className="min-h-0 flex-1 overflow-auto text-sm text-[var(--ink-black)]"
            style={{ lineHeight: 1.6 }}
          >
            {refinedText}
          </div>
          <button
            type="button"
            onClick={onInsert}
            className="absolute bottom-3 right-3 rounded-md bg-[var(--ink-black)] px-3 py-1.5 text-xs font-medium text-white shadow-md transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2"
          >
            Insert
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 w-full rounded-full border border-[#DDD9D5] bg-white px-6 py-2.5 text-sm font-medium text-[var(--ink-black)] shadow-sm transition-all hover:border-[var(--ink-black)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2"
      >
        Cancel
      </button>
    </div>
  );
}
