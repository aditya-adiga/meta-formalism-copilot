/**
 * Input provenance tracking for artifact generation.
 *
 * At generation time we hash the inputs (source text + context) and store the
 * hash on each ArtifactVersion. On render, comparing the stored hash against a
 * hash of the current inputs tells us whether the artifact is stale.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GenerationProvenance = {
  /** FNV-1a hash of the generation inputs (text + context) */
  inputHash: string;
  /** ISO timestamp when the generation was triggered */
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// FNV-1a hash (32-bit)
// ---------------------------------------------------------------------------

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Fast 32-bit FNV-1a hash, returned as an 8-char hex string. */
export function fnv1aHash(str: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Convert to unsigned 32-bit then to hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Hash the generation inputs into a single deterministic string. */
export function buildInputHash(text: string, context: string): string {
  // Separator chosen to be unlikely in natural text, preventing collisions
  // between ("ab", "cd") and ("a", "bcd").
  return fnv1aHash(text + "\x00\x1f" + context);
}

/** Build a full provenance record for a generation triggered now. */
export function buildProvenance(text: string, context: string): GenerationProvenance {
  return {
    inputHash: buildInputHash(text, context),
    generatedAt: new Date().toISOString(),
  };
}
