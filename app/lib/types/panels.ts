export type PanelId =
  | "source"
  | "context"
  | "semiformal"
  | "lean"
  | "graph"
  | "node-detail"
  | "analytics";

export type PanelDef = {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  statusSummary: string;
  /** Hide from the rail until the panel has content */
  hidden?: boolean;
};
