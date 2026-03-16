import type { PropositionNode, SourceDocument } from "./decomposition";

export const WORKSPACE_VERSION = 1;
export const WORKSPACE_KEY = "workspace-v1";

/** Decomposition state as persisted — excludes transient extractionStatus */
export type PersistedDecomposition = {
  nodes: PropositionNode[];
  selectedNodeId: string | null;
  paperText: string;
  sources: SourceDocument[];
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
};
