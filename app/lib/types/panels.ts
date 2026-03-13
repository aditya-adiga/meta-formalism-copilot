export type PanelId =
  | "source"
  | "decomposition" // renamed from "graph"
  | "graph" // alias kept for backward compatibility
  | "node-detail"
  | "semiformal"
  | "lean"
  | "causal-graph"
  | "statistical-model"
  | "property-tests"
  | "dialectical-map"
  | "analytics";

export type PanelDef = {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  statusSummary: string;
  /** Hide from the rail until the panel has content */
  hidden?: boolean;
};
