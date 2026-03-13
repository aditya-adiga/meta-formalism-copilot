export type PropositionKind =
  | "definition"
  | "lemma"
  | "theorem"
  | "proposition"
  | "corollary"
  | "axiom";

export type NodeVerificationStatus =
  | "unverified"
  | "in-progress"
  | "verified"
  | "failed";

export type SourceDocument = {
  sourceId: string;
  sourceLabel: string;
  text: string;
};

export type NodeArtifact = {
  type: import("./session").ArtifactType;
  content: string;
  verificationStatus: NodeVerificationStatus;
  verificationErrors: string;
};

export type PropositionNode = {
  id: string;
  label: string;
  kind: PropositionKind;
  statement: string;
  proofText: string;
  dependsOn: string[];
  sourceId: string;
  sourceLabel: string;
  // Legacy deductive-only fields (will migrate to artifacts[] in a follow-up)
  semiformalProof: string;
  leanCode: string;
  verificationStatus: NodeVerificationStatus;
  verificationErrors: string;
  // New: multi-artifact support
  context: string; // per-node context (empty = inherit global)
  selectedArtifactTypes: import("./session").ArtifactType[];
  artifacts: NodeArtifact[];
};

export type DecompositionState = {
  nodes: PropositionNode[];
  selectedNodeId: string | null;
  paperText: string;
  sources: SourceDocument[];
  extractionStatus: "idle" | "extracting" | "done" | "error";
};
