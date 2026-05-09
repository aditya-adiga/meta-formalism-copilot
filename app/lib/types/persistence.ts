import type { PropositionNode, SourceDocument } from "./decomposition";

export const WORKSPACE_VERSION = 2;
export const WORKSPACE_KEY = "workspace-v2";

/** Decomposition state as persisted — excludes transient extractionStatus */
export type PersistedDecomposition = {
  nodes: PropositionNode[];
  selectedNodeId: string | null;
  paperText: string;
  sources: SourceDocument[];
  graphLayout?: import("./decomposition").GraphLayout;
};

export type PersistedWorkspace = {
  version: number;
  sourceText: string;
  extractedFiles: { name: string; text: string }[];
  contextText: string;
  semiformalText: string;
  leanCode: string;
  semiformalDirty: boolean;
  verificationStatus: "none" | "valid" | "invalid";
  verificationErrors: string;
  decomposition: PersistedDecomposition;
  // Artifact data (JSON-stringified structured types, added in v2)
  causalGraph: string | null;
  statisticalModel: string | null;
  propertyTests: string | null;
  dialecticalMap: string | null;
  counterexamples: string | null;
};
