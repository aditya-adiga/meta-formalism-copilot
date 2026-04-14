/**
 * Types for user-defined custom artifact types.
 *
 * Custom types let users design their own formalization prompts via an
 * LLM-assisted iterative flow, then use them alongside the built-in types.
 * Definitions are stored in the workspace persistence layer (per-workspace
 * via localStorage).
 */

/** All custom artifact type IDs are prefixed with "custom-" to distinguish them from built-in types. */
export type CustomArtifactTypeId = `custom-${string}`;

export interface CustomArtifactTypeDefinition {
  /** Unique identifier, always starts with "custom-" */
  id: CustomArtifactTypeId;
  /** User-facing name, e.g. "Ethical Analysis" */
  name: string;
  /** Short label for the chip selector */
  chipLabel: string;
  /** What this artifact type produces */
  description: string;
  /** When this type is most useful */
  whenToUse: string;
  /** The system prompt sent to the LLM when generating this artifact */
  systemPrompt: string;
  /** Whether the LLM should return structured JSON or free-form text */
  outputFormat: "json" | "text";
  createdAt: string;
  updatedAt: string;
}

/** Type guard: returns true if an ArtifactType string is a custom type ID. */
export function isCustomType(type: string): type is CustomArtifactTypeId {
  return type.startsWith("custom-");
}
