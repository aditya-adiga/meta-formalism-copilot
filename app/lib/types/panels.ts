export type PanelId =
  | "source"
  | "semiformal"
  | "lean"
  | "graph"
  | "node-detail"
  | "group-detail"
  | "analytics";

export type PanelDef = {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  statusSummary: string;
  /** Hide from the rail until the panel has content */
  hidden?: boolean;
};
