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

/** Balanced Perspectives response shape (003 §3) */
export type BalancedPerspectivesResponse = {
  balancedPerspectives: {
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
    counterexamples: Array<{
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
    chipLabel: "Mathematical Proof",
    description: "Creates a formally structured proof with mathematical notation. Spells out many individual logical steps appropriate for machine-checked proof verification via Lean4 theorem proving code.",
    whenToUse: "Claims that already have a precise statement, where the accuracy of specific equations and applications of supporting theorems need precise validation",
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
    description: "Directed graph of variables. Nodes will be component ideas or effects, edges will be positively or negatively weighted relationships between nodes.",
    whenToUse: "Reasoning about cause-and-effect, interventions, or counterfactual questions. Text with multiple inter-related ideas that should be considered simultaneously.",
  },
  "statistical-model": {
    label: "Statistical Model",
    chipLabel: "Statistical Model",
    description: "Extracts variables with roles and testable hypotheses with null hypotheses.  Suggests statistical tests appropriate to the structure of the hypotheses and data to be collected.",
    whenToUse: "Claims involving quantities, correlations, or empirical evidence testable with data. When designing a study, to pre-register hypotheses and ensure data collection matches specific tests. When multiple sources of evidence need to be weighed against one another. When level of statistical confidence in a hypothesis is important.",
  },
  "property-tests": {
    label: "Property Tests",
    chipLabel: "Property Tests",
    description: "Isolates features or variables that are required or expected to remain consistent. States them in terms of invariants, preconditions, postconditions, and data generators. Generates pseudo-code to adapt into executable test specs for a project.",
    whenToUse: "Rules that should always hold, especially for computational or algorithmic claims. Test-driven software development.",
  },
  "balanced-perspectives": {
    label: "Balanced Perspectives",
    chipLabel: "Balanced Perspectives",
    description: "Identifies distinct perspectives present in the source text. Hypothesizes tensions between those perspectives. Proposes a synthesis perspective attempting to resolve all tensions.",
    whenToUse: "Topics with multiple legitimate viewpoints where you want the full argumentative terrain. Decisions with many stakeholders who may have different values. When you have an established opinion and want to understand disagreements or reduce bias.",
  },
  counterexamples: {
    label: "Counterexamples",
    chipLabel: "Counterexamples",
    description: "Adversarial analysis identifying specific scenarios that could falsify the claim, with plausibility ratings.",
    whenToUse: "Testing the robustness of a claim by finding edge cases, exceptions, or conditions under which it breaks down. When a proof fails and you don’t understand why. When statistical evidence is strong but doesn’t create certainty or agreement. When you need to challenge a specific perspective.",
  },
};

/** Built-in artifact types selectable as chips (lean excluded — it's step 2 of the deductive pipeline) */
export const SELECTABLE_ARTIFACT_TYPES: BuiltinArtifactType[] = [
  "semiformal",
  "causal-graph",
  "statistical-model",
  "property-tests",
  "balanced-perspectives",
  "counterexamples",
];

/** Maps built-in artifact types to their API route paths */
export const ARTIFACT_ROUTE: Partial<Record<BuiltinArtifactType, string>> = {
  "causal-graph": "/api/formalization/causal-graph",
  "statistical-model": "/api/formalization/statistical-model",
  "property-tests": "/api/formalization/property-tests",
  "balanced-perspectives": "/api/formalization/balanced-perspectives",
  counterexamples: "/api/formalization/counterexamples",
};

/** Maps built-in artifact types to their JSON response field name (varies by type; not a mechanical conversion) */
export const ARTIFACT_RESPONSE_KEY: Record<BuiltinArtifactType, string> = {
  semiformal: "proof",
  lean: "leanCode",
  "causal-graph": "causalGraph",
  "statistical-model": "statisticalModel",
  "property-tests": "propertyTests",
  "balanced-perspectives": "balancedPerspectives",
  counterexamples: "counterexamples",
};
