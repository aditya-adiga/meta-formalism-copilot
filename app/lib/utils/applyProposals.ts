import type { IntegrationProposal } from "@/app/lib/types/evidence";

/**
 * Resolve a dot-notation field path (e.g. "hypotheses[1].statement") to
 * a { parent, key } pair so the value can be read or written.
 *
 * Returns null if the path cannot be resolved against the object.
 */
export function resolveFieldPath(
  obj: Record<string, unknown>,
  path: string,
): { parent: Record<string, unknown> | unknown[]; key: string | number } | null {
  // Split "hypotheses[1].statement" → ["hypotheses", "1", "statement"]
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  if (segments.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- navigating dynamic paths
  let current: any = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const idx = /^\d+$/.test(seg) ? Number(seg) : seg;
    current = current?.[idx];
    if (current === undefined || current === null) return null;
  }

  const lastSeg = segments[segments.length - 1];
  const lastKey = /^\d+$/.test(lastSeg) ? Number(lastSeg) : lastSeg;

  if (typeof current !== "object" || current === null) return null;
  if (!(lastKey in current)) return null;

  return { parent: current, key: lastKey };
}

/**
 * Read the value at a dot-notation field path.
 * Returns undefined if the path doesn't resolve.
 */
export function getFieldValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const resolved = resolveFieldPath(obj, path);
  if (!resolved) return undefined;
  return (resolved.parent as Record<string | number, unknown>)[resolved.key];
}

/**
 * Apply approved integration proposals to an artifact JSON string.
 *
 * Only proposals with `decision === true` are applied. Each proposal's
 * `fieldPath` is resolved against the parsed artifact object and the
 * field is set to `proposedValue`.
 *
 * Returns the updated JSON string, or the original if no proposals apply.
 */
export function applyProposals(
  artifactJson: string,
  proposals: IntegrationProposal[],
): string {
  const approved = proposals.filter((p) => p.decision === true);
  if (approved.length === 0) return artifactJson;

  const obj = JSON.parse(artifactJson) as Record<string, unknown>;

  for (const proposal of approved) {
    const resolved = resolveFieldPath(obj, proposal.fieldPath);
    if (!resolved) continue;

    // Try to parse proposedValue as JSON (for objects/arrays/numbers),
    // fall back to raw string for plain text fields
    let value: unknown;
    try {
      value = JSON.parse(proposal.proposedValue);
    } catch {
      value = proposal.proposedValue;
    }

    (resolved.parent as Record<string | number, unknown>)[resolved.key] = value;
  }

  return JSON.stringify(obj);
}
