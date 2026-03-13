import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import IconRail from "@/app/components/layout/IconRail";
import FocusPane from "@/app/components/layout/FocusPane";

type PanelShellProps = {
  panels: PanelDef[];
  activePanelId: PanelId;
  onSelectPanel: (id: PanelId) => void;
  panelContent: Partial<Record<PanelId, React.ReactNode>>;
  onExportAll?: () => void;
  exportAllDisabled?: boolean;
};

export default function PanelShell({ panels, activePanelId, onSelectPanel, panelContent, onExportAll, exportAllDisabled }: PanelShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--ivory-cream)]">
      <IconRail
        panels={panels}
        activePanelId={activePanelId}
        onSelectPanel={onSelectPanel}
        onExportAll={onExportAll}
        exportAllDisabled={exportAllDisabled}
      />
      <FocusPane
        activePanelId={activePanelId}
        panelContent={panelContent}
      />
    </div>
  );
}
