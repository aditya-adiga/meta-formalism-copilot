/**
 * Merges final artifact data with a partial streaming preview.
 *
 * All artifact panels need the same logic: show final data if available,
 * fall back to the streaming preview during generation, and derive
 * `hasDisplayData` + adjusted `loading` for ArtifactPanelShell.
 */
export function mergeStreamingPreview<T>(
  finalData: T | null,
  streamingPreview: T | null | undefined,
  hasContent: (data: T) => boolean,
): { displayData: T | null; hasDisplayData: boolean } {
  const displayData = finalData ?? streamingPreview ?? null;
  const hasDisplayData = displayData !== null && hasContent(displayData);
  return { displayData, hasDisplayData };
}
