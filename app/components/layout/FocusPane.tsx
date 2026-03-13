import type { PanelId } from "@/app/lib/types/panels";

type FocusPaneProps = {
  activePanelId: PanelId;
  /** Render function: called with the active panel ID to produce content */
  renderPanel: (id: PanelId) => React.ReactNode;
};

export default function FocusPane({ activePanelId, renderPanel }: FocusPaneProps) {
  const content = renderPanel(activePanelId);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {content ?? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590]">
          Select a panel from the sidebar
        </div>
      )}
    </div>
  );
}
