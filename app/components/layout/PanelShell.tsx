import type { PanelDef, PanelId, SplitConfig } from "@/app/lib/types/panels";
import IconRail from "@/app/components/layout/IconRail";
import FocusPane from "@/app/components/layout/FocusPane";
import SplitPane from "@/app/components/layout/SplitPane";

type PanelShellProps = {
  panels: PanelDef[];
  activePanelId: PanelId;
  onSelectPanel: (id: PanelId) => void;
  renderPanel: (id: PanelId) => React.ReactNode;
  onExportAll?: () => void;
  exportAllDisabled?: boolean;
  onOpenHelp?: () => void;
  split: SplitConfig;
};

export default function PanelShell({
  panels, activePanelId, onSelectPanel, renderPanel,
  onExportAll, exportAllDisabled, onOpenHelp, split,
}: PanelShellProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--ivory-cream)]">
      <IconRail
        panels={panels}
        activePanelId={activePanelId}
        onSelectPanel={onSelectPanel}
        onExportAll={onExportAll}
        exportAllDisabled={exportAllDisabled}
        onOpenHelp={onOpenHelp}
        secondaryPanelId={split.secondaryPanelId}
        onSelectSecondaryPanel={split.onSelectSecondaryPanel}
      />
      {split.secondaryPanelId ? (
        <SplitPane
          primaryPanelId={activePanelId}
          secondaryPanelId={split.secondaryPanelId}
          orientation={split.orientation}
          renderPanel={renderPanel}
          onCloseSecondary={split.onCloseSecondary}
          onToggleOrientation={split.onToggleOrientation}
        />
      ) : (
        <FocusPane
          activePanelId={activePanelId}
          renderPanel={renderPanel}
        />
      )}
    </div>
  );
}
