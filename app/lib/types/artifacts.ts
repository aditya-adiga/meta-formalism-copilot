import type { ArtifactType } from "./session";

/** Uniform request shape for all new artifact generation routes (003 §2) */
export type ArtifactGenerationRequest = {
  sourceText: string;
  context: string;
  nodeId?: string;
  nodeLabel?: string;
  previousAttempt?: string;
  instruction?: string;
};

/** Causal Graph response shape (003 §3) */
export type CausalGraphResponse = {
  causalGraph: {
    variables: Array<{
      id: string;
      label: string;
      description: string;
    }>;
    edges: Array<{
      from: string;
      to: string;
      weight: number;
      mechanism: string;
    }>;
    confounders: Array<{
      id: string;
      label: string;
      affectedEdges: string[];
    }>;
    summary: string;
  };
};

/** Uniform verification response shape for all artifact types (003 §6) */
export type ArtifactVerificationResponse = {
  valid: boolean;
  issues: Array<{
    severity: "error" | "warning" | "info";
    description: string;
    location?: string;
  }>;
  summary: string;
};

/** Maps artifact types to their API route paths */
export const ARTIFACT_ROUTE: Partial<Record<ArtifactType, string>> = {
  "causal-graph": "/api/formalization/causal-graph",
};
