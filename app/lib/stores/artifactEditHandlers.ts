import type { ArtifactKey } from "@/app/lib/types/artifactStore";
import { useWorkspaceStore } from "@/app/lib/stores/workspaceStore";

export type ArtifactEditHandler = (v: string) => void;
export type ArtifactEditHandlers = Record<
  ArtifactKey,
  { onSave: ArtifactEditHandler; onAiEdited: ArtifactEditHandler }
>;

const ARTIFACT_KEYS = [
  "causal-graph",
  "statistical-model",
  "property-tests",
  "balanced-perspectives",
  "counterexamples",
] as const satisfies readonly ArtifactKey[];

/**
 * Factory for the per-artifact edit handlers wired into page-level render.
 * `onSave` tags the version as `manual-edit` (inline Save button on a panel);
 * `onAiEdited` tags it as `ai-edit` (successful Cmd+K or whole-doc rewrite).
 * Both go through `setArtifactEdited` so undo/redo + version history are
 * preserved. The shim's `setPersistedXxx` callbacks use `setArtifactGenerated`
 * and are intentionally kept on restore/generation paths only.
 */
export function buildArtifactEditHandlers(): ArtifactEditHandlers {
  const makeHandler = (key: ArtifactKey, source: "manual-edit" | "ai-edit"): ArtifactEditHandler =>
    (v) => useWorkspaceStore.getState().setArtifactEdited(key, v, source);
  return Object.fromEntries(
    ARTIFACT_KEYS.map((k) => [
      k,
      { onSave: makeHandler(k, "manual-edit"), onAiEdited: makeHandler(k, "ai-edit") },
    ]),
  ) as ArtifactEditHandlers;
}
