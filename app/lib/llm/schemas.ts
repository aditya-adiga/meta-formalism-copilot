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
