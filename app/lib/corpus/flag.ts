/**
 * Corpus feature flag (DD-009 sub-task S1).
 *
 * DEFAULT OFF and DEV-ONLY. In S1 there is no localStorage->corpus migration
 * (that is S4), so enabling this starts from an EMPTY corpus and does not carry
 * existing localStorage work over. It exists only to let developers exercise the
 * OPFS path; it must not be turned on for end users until S4 ships migration.
 *
 * Enable via either the build-time env `NEXT_PUBLIC_CORPUS_FS=1` or, at runtime
 * in a dev browser, `localStorage.setItem("corpus-fs-enabled", "1")`.
 */

export const CORPUS_FLAG_KEY = "corpus-fs-enabled";

export function isCorpusEnabled(): boolean {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CORPUS_FS === "1") return true;
  if (typeof window !== "undefined") {
    try {
      return window.localStorage.getItem(CORPUS_FLAG_KEY) === "1";
    } catch {
      return false;
    }
  }
  return false;
}
