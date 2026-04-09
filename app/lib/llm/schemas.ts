/**
 * JSON Schemas for structured LLM outputs.
 * Used with OpenRouter's response_format to enforce valid JSON responses.
 * Each schema uses strict mode (additionalProperties: false, all properties required).
 */
import type { ResponseFormat } from "./callLlm";

export const decompositionSchema: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "decomposition_nodes",
    strict: true,
    schema: {
      type: "object",
      required: ["propositions"],
      additionalProperties: false,
      properties: {
        propositions: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "label", "kind", "statement", "proofText", "dependsOn", "sourceId"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              kind: { type: "string" },
              statement: { type: "string" },
              proofText: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } },
              sourceId: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const causalGraphSchema: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "causal_graph",
    strict: true,
    schema: {
      type: "object",
      required: ["variables", "edges", "confounders", "summary"],
      additionalProperties: false,
      properties: {
        variables: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "label", "description"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              description: { type: "string" },
            },
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            required: ["from", "to", "weight", "mechanism"],
            additionalProperties: false,
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              weight: { type: "number" },
              mechanism: { type: "string" },
            },
          },
        },
        confounders: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "label", "affectedEdges"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              affectedEdges: { type: "array", items: { type: "string" } },
            },
          },
        },
        summary: { type: "string" },
      },
    },
  },
};

export const balancedPerspectivesSchema: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "balanced_perspectives",
    strict: true,
    schema: {
      type: "object",
      required: ["topic", "perspectives", "tensions", "synthesis", "summary"],
      additionalProperties: false,
      properties: {
        topic: { type: "string" },
        perspectives: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "label", "coreClaim", "supportingArguments", "vulnerabilities"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              coreClaim: { type: "string" },
              supportingArguments: { type: "array", items: { type: "string" } },
              vulnerabilities: { type: "array", items: { type: "string" } },
            },
          },
        },
        tensions: {
          type: "array",
          items: {
            type: "object",
            required: ["between", "description"],
            additionalProperties: false,
            properties: {
              between: { type: "array", items: { type: "string" } },
              description: { type: "string" },
            },
          },
        },
        synthesis: {
          type: "object",
          required: ["equilibrium", "howAddressed"],
          additionalProperties: false,
          properties: {
            equilibrium: { type: "string" },
            howAddressed: {
              type: "array",
              items: {
                type: "object",
                required: ["perspectiveId", "resolution"],
                additionalProperties: false,
                properties: {
                  perspectiveId: { type: "string" },
                  resolution: { type: "string" },
                },
              },
            },
          },
        },
        summary: { type: "string" },
      },
    },
  },
};

export const propertyTestsSchema: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "property_tests",
    strict: true,
    schema: {
      type: "object",
      required: ["properties", "dataGenerators", "summary"],
      additionalProperties: false,
      properties: {
        properties: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "name", "description", "preconditions", "postcondition", "pseudocode"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              preconditions: { type: "string" },
              postcondition: { type: "string" },
              pseudocode: { type: "string" },
            },
          },
        },
        dataGenerators: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "description", "constraints"],
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              constraints: { type: "string" },
            },
          },
        },
        summary: { type: "string" },
      },
    },
  },
};

export const statisticalModelSchema: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "statistical_model",
    strict: true,
    schema: {
      type: "object",
      required: ["variables", "hypotheses", "assumptions", "sampleRequirements", "summary"],
      additionalProperties: false,
      properties: {
        variables: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "label", "role", "distribution"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              role: { type: "string" },
              distribution: { type: "string" },
            },
          },
        },
        hypotheses: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "statement", "nullHypothesis", "testSuggestion"],
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              statement: { type: "string" },
              nullHypothesis: { type: "string" },
              testSuggestion: { type: "string" },
            },
          },
        },
        assumptions: { type: "array", items: { type: "string" } },
        sampleRequirements: { type: "string" },
        summary: { type: "string" },
      },
    },
  },
};
