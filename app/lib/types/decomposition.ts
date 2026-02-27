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

export type PropositionNode = {
  id: string;
  label: string;
  kind: PropositionKind;
  statement: string;
  proofText: string;
  dependsOn: string[];
  sourceId: string;
  sourceLabel: string;
  semiformalProof: string;
  leanCode: string;
  verificationStatus: NodeVerificationStatus;
  verificationErrors: string;
};

export type DecompositionState = {
  nodes: PropositionNode[];
  selectedNodeId: string | null;
  paperText: string;
  sources: SourceDocument[];
  extractionStatus: "idle" | "extracting" | "done" | "error";
};
