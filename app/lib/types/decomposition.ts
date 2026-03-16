export type NodeKind =
  // Mathematical (used by TeX/PDF fast-path parsers)
  | "definition"
  | "lemma"
  | "theorem"
  | "proposition"
  | "corollary"
  | "axiom"
  // Argumentative
  | "claim"
  | "evidence"
  | "assumption"
  | "objection"
  | "rebuttal"
  // Structural
  | "question"
  | "observation"
  | "narrative"
  | "methodology"
  | "conclusion";

/** @deprecated Use NodeKind instead */
export type PropositionKind = NodeKind;

export type NodeVerificationStatus =
  | "unverified"
  | "in-progress"
  | "verified"
  | "failed";

/** Map global VerificationStatus to per-node NodeVerificationStatus */
export function toNodeVerificationStatus(
  status: import("./session").VerificationStatus,
): NodeVerificationStatus {
  switch (status) {
    case "valid": return "verified";
    case "invalid": return "failed";
    case "verifying": return "in-progress";
    default: return "unverified";
  }
}

/** Map per-node NodeVerificationStatus to global VerificationStatus */
export function fromNodeVerificationStatus(
  status: NodeVerificationStatus,
): import("./session").VerificationStatus {
  switch (status) {
    case "verified": return "valid";
    case "failed": return "invalid";
    case "in-progress": return "verifying";
    default: return "none";
  }
}

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
  kind: NodeKind;
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
