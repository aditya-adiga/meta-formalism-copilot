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

/** Statistical Model response shape (003 §3) */
export type StatisticalModelResponse = {
  statisticalModel: {
    variables: Array<{
      id: string;
      label: string;
      role: "independent" | "dependent" | "confounding" | "control";
      distribution?: string;
    }>;
    hypotheses: Array<{
      id: string;
      statement: string;
      nullHypothesis: string;
      testSuggestion: string;
    }>;
    assumptions: string[];
    sampleRequirements?: string;
    summary: string;
  };
};

/** Property Tests response shape (003 §3) */
export type PropertyTestsResponse = {
  propertyTests: {
    properties: Array<{
      id: string;
      name: string;
      description: string;
      preconditions: string;
      postcondition: string;
      pseudocode: string;
    }>;
    dataGenerators: Array<{
      name: string;
      description: string;
      constraints: string;
    }>;
    summary: string;
  };
};

/** Dialectical Map response shape (003 §3) */
export type DialecticalMapResponse = {
  dialecticalMap: {
    topic: string;
    perspectives: Array<{
      id: string;
      label: string;
      coreClaim: string;
      supportingArguments: string[];
      vulnerabilities: string[];
    }>;
    tensions: Array<{
      between: [string, string];
      description: string;
    }>;
    synthesis: {
      equilibrium: string;
      howAddressed: Array<{
        perspectiveId: string;
        resolution: string;
      }>;
    };
    summary: string;
  };
};

/** Maps artifact types to their API route paths */
export const ARTIFACT_ROUTE: Partial<Record<ArtifactType, string>> = {
  "causal-graph": "/api/formalization/causal-graph",
  "statistical-model": "/api/formalization/statistical-model",
  "property-tests": "/api/formalization/property-tests",
  "dialectical-map": "/api/formalization/dialectical-map",
};
