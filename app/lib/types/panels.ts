export type PanelId =
  | "source"
  | "context"
  | "decomposition" // renamed from "graph"
  | "node-detail"
  | "semiformal"
  | "lean"
  | "causal-graph"
  | "statistical-model"
  | "property-tests"
  | "balanced-perspectives"
  | "counterexamples"
  | "analytics";

export type PanelGroup = "navigation" | "artifacts" | "meta";

export type PanelDef = {
  id: PanelId;
  label: string;
  icon: React.ReactNode;
  statusSummary: string;
  /** Hide from the rail until the panel has content */
  hidden?: boolean;
  /** Group for visual separation in the rail */
  group?: PanelGroup;
};
