import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import IconRail from "@/app/components/layout/IconRail";
import FocusPane from "@/app/components/layout/FocusPane";

type PanelShellProps = {
  panels: PanelDef[];
  activePanelId: PanelId;
  onSelectPanel: (id: PanelId) => void;
  renderPanel: (id: PanelId) => React.ReactNode;
  onExportAll?: () => void;
  exportAllDisabled?: boolean;
  onOpenHelp?: () => void;
};

export default function PanelShell({ panels, activePanelId, onSelectPanel, renderPanel, onExportAll, exportAllDisabled, onOpenHelp }: PanelShellProps) {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--ivory-cream)]">
      <IconRail
        panels={panels}
        activePanelId={activePanelId}
        onSelectPanel={onSelectPanel}
        onExportAll={onExportAll}
        exportAllDisabled={exportAllDisabled}
        onOpenHelp={onOpenHelp}
      />
      <FocusPane
        activePanelId={activePanelId}
        renderPanel={renderPanel}
      />
    </div>
  );
}
