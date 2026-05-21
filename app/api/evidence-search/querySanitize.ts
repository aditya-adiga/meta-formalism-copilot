/** Sanitizes a user-supplied query override for the evidence search API.
 *
 * Users can edit the OpenAlex search queries in the UI and re-run. This
 * bounds untrusted input before it is sent to OpenAlex: only non-empty
 * trimmed strings, each capped in length, and the list capped in count. */

/** Max number of override queries accepted (mirrors the 2-3 the LLM emits,
 *  with headroom). */
export const MAX_OVERRIDE_QUERIES = 5;
/** Max characters per query. */
export const MAX_QUERY_LENGTH = 100;

export function sanitizeQueries(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned: string[] = [];
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().slice(0, MAX_QUERY_LENGTH);
    if (trimmed.length > 0) cleaned.push(trimmed);
    if (cleaned.length >= MAX_OVERRIDE_QUERIES) break;
  }
  return cleaned;
}
