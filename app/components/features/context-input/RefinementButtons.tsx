type RefinementButtonsProps = {
  onRefine: (actionId: string) => void;
};

const REFINEMENT_ACTIONS = [
  { id: "elaborate", label: "Elaborate", icon: "↗" },
  { id: "shorten", label: "Shorten", icon: "↙" },
  { id: "formalize", label: "Make Precise", icon: "✦" },
  { id: "clarify", label: "Clarify", icon: "◆" },
] as const;

export default function RefinementButtons({ onRefine }: RefinementButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[#6B6560]">Refine:</span>
      {REFINEMENT_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onRefine(action.id)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD9D5] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink-black)] shadow-sm transition-all hover:border-[var(--ink-black)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-1"
        >
          <span className="text-sm opacity-60">{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  );
}
