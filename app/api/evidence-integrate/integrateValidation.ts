/**
 * Validation helpers for LLM-generated integration proposals.
 *
 * Extracted from the route handler so they can be unit-tested independently.
 */

import { resolveFieldPath } from "@/app/lib/utils/applyProposals";
import type { IntegrationEditType, RawIntegrationProposal } from "@/app/lib/types/evidence";

const VALID_EDIT_TYPES: readonly string[] = [
  "update-prior",
  "add-evidence",
  "flag-contradiction",
  "refine-wording",
];

/**
 * Validate a single raw proposal from LLM output.
 *
 * @param raw - The raw proposal object from the LLM
 * @param artifact - The parsed artifact object (to verify fieldPath)
 * @param validPaperIds - Set of openAlexIds from the request papers
 * @returns A validated RawIntegrationProposal, or null if invalid
 */
export function validateProposal(
  raw: Record<string, unknown>,
  artifact: Record<string, unknown>,
  validPaperIds: Set<string>,
): RawIntegrationProposal | null {
  // Required string fields
  const fieldPath = raw.fieldPath;
  const fieldLabel = raw.fieldLabel;
  const currentValue = raw.currentValue;
  const proposedValue = raw.proposedValue;
  const rationale = raw.rationale;

  if (
    typeof fieldPath !== "string" || !fieldPath ||
    typeof fieldLabel !== "string" || !fieldLabel ||
    typeof currentValue !== "string" ||
    typeof proposedValue !== "string" ||
    typeof rationale !== "string"
  ) {
    return null;
  }

  // proposedValue must differ from currentValue
  if (currentValue === proposedValue) return null;

  // fieldPath must resolve to an existing field in the artifact
  if (!resolveFieldPath(artifact, fieldPath)) return null;

  // paperIds must be a non-empty array of valid IDs
  const paperIds = raw.paperIds;
  if (!Array.isArray(paperIds) || paperIds.length === 0) return null;
  const filteredPaperIds = (paperIds as unknown[]).filter(
    (id): id is string => typeof id === "string" && validPaperIds.has(id),
  );
  if (filteredPaperIds.length === 0) return null;

  // editType must be valid
  const editType = typeof raw.editType === "string" && VALID_EDIT_TYPES.includes(raw.editType)
    ? (raw.editType as IntegrationEditType)
    : "refine-wording";

  return {
    fieldPath,
    fieldLabel,
    currentValue,
    proposedValue,
    rationale,
    paperIds: filteredPaperIds,
    editType,
  };
}
