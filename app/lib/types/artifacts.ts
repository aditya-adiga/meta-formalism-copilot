import type { BuiltinArtifactType } from "./session";

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

/** Counterexamples response shape */
export type CounterexamplesResponse = {
  counterexamples: {
    claim: string;
    scenarios: Array<{
      id: string;
      scenario: string;
      targetAssumption: string;
      explanation: string;
      plausibility: "high" | "medium" | "low";
    }>;
    robustnessAssessment: string;
    summary: string;
  };
};

/** Display metadata for each built-in artifact type */
export const ARTIFACT_META: Record<BuiltinArtifactType, {
  label: string;
  chipLabel: string;
  description: string;
  whenToUse: string;
}> = {
  semiformal: {
    label: "Semiformal Proof",
    chipLabel: "Deductive (Lean)",
    description: "Structured deductive argument with mathematical notation, logical steps, and a machine-verifiable Lean 4 proof.",
    whenToUse: "Claims that can be stated as precise propositions needing formal verification.",
  },
  lean: {
    label: "Lean4 Code",
    chipLabel: "Lean4 Code",
    description: "Raw Lean 4 theorem prover code.",
    whenToUse: "Generated automatically as step 2 of the deductive pipeline.",
  },
  "causal-graph": {
    label: "Causal Graph",
    chipLabel: "Causal Graph",
    description: "Directed graph of variables, causal relationships, confounders, and mechanisms.",
    whenToUse: "Reasoning about cause-and-effect, interventions, or counterfactual questions.",
  },
  "statistical-model": {
    label: "Statistical Model",
    chipLabel: "Statistical Model",
    description: "Variables with roles, testable hypotheses with null hypotheses, and suggested statistical tests.",
    whenToUse: "Claims involving quantities, correlations, or empirical evidence testable with data.",
  },
  "property-tests": {
    label: "Property Tests",
    chipLabel: "Property Tests",
    description: "Invariants, preconditions, postconditions, and data generators as executable test specs.",
    whenToUse: "Rules that should always hold, especially for computational or algorithmic claims.",
  },
  "dialectical-map": {
    label: "Dialectical Map",
    chipLabel: "Dialectical Map",
    description: "Map of distinct viewpoints, tensions between them, and a proposed synthesis.",
    whenToUse: "Topics with multiple legitimate viewpoints where you want the full argumentative terrain.",
  },
  counterexamples: {
    label: "Counterexamples",
    chipLabel: "Counterexamples",
    description: "Adversarial analysis identifying specific scenarios that could falsify the claim, with plausibility ratings.",
    whenToUse: "Testing the robustness of a claim by finding edge cases, exceptions, or conditions under which it breaks down.",
  },
};

/** Built-in artifact types selectable as chips (lean excluded — it's step 2 of the deductive pipeline) */
export const SELECTABLE_ARTIFACT_TYPES: BuiltinArtifactType[] = [
  "semiformal",
  "causal-graph",
  "statistical-model",
  "property-tests",
  "dialectical-map",
  "counterexamples",
];

/** Maps built-in artifact types to their API route paths */
export const ARTIFACT_ROUTE: Partial<Record<BuiltinArtifactType, string>> = {
  "causal-graph": "/api/formalization/causal-graph",
  "statistical-model": "/api/formalization/statistical-model",
  "property-tests": "/api/formalization/property-tests",
  "dialectical-map": "/api/formalization/dialectical-map",
  counterexamples: "/api/formalization/counterexamples",
};

/** Maps built-in artifact types to their JSON response field name (varies by type; not a mechanical conversion) */
export const ARTIFACT_RESPONSE_KEY: Record<BuiltinArtifactType, string> = {
  semiformal: "proof",
  lean: "leanCode",
  "causal-graph": "causalGraph",
  "statistical-model": "statisticalModel",
  "property-tests": "propertyTests",
  "dialectical-map": "dialecticalMap",
  counterexamples: "counterexamples",
};
