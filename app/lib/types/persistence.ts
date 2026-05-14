import type { PropositionNode, SourceDocument } from "./decomposition";
import type { CustomArtifactTypeDefinition } from "./customArtifact";

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
  // Custom artifact types and their generated data (optional, backward-compatible addition to v2)
  customArtifactTypes?: CustomArtifactTypeDefinition[];
  /** Generated output for custom types, keyed by custom type ID */
  customArtifactData?: Record<string, string | null>;
};
