import { describe, it, expect, beforeEach } from "vitest";
import { buildArtifactEditHandlers } from "@/app/lib/stores/artifactEditHandlers";
import { useWorkspaceStore } from "@/app/lib/stores/workspaceStore";
import type { ArtifactKey } from "@/app/lib/types/artifactStore";

const KEYS: readonly ArtifactKey[] = [
  "causal-graph",
  "statistical-model",
  "property-tests",
  "balanced-perspectives",
  "counterexamples",
];

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
});

describe("buildArtifactEditHandlers", () => {
  it("returns onSave + onAiEdited handlers for every structured artifact key", () => {
    const handlers = buildArtifactEditHandlers();
    for (const key of KEYS) {
      expect(typeof handlers[key].onSave).toBe("function");
      expect(typeof handlers[key].onAiEdited).toBe("function");
    }
  });

  it.each(KEYS)("onSave records the new version with source=manual-edit (%s)", (key) => {
    // Seed a generated baseline so the edit has something to build on.
    useWorkspaceStore.getState().setArtifactGenerated(key, "baseline");

    buildArtifactEditHandlers()[key].onSave("edited-by-hand");

    const rec = useWorkspaceStore.getState().artifacts[key];
    expect(rec).toBeDefined();
    const latest = rec!.versions[rec!.currentVersionIndex];
    expect(latest.content).toBe("edited-by-hand");
    expect(latest.source).toBe("manual-edit");
  });

  it.each(KEYS)("onAiEdited records the new version with source=ai-edit (%s)", (key) => {
    useWorkspaceStore.getState().setArtifactGenerated(key, "baseline");

    buildArtifactEditHandlers()[key].onAiEdited("edited-by-ai");

    const rec = useWorkspaceStore.getState().artifacts[key];
    const latest = rec!.versions[rec!.currentVersionIndex];
    expect(latest.content).toBe("edited-by-ai");
    expect(latest.source).toBe("ai-edit");
  });

  it("manual and AI edits on the same artifact produce distinct source tags in version history", () => {
    const key: ArtifactKey = "causal-graph";
    const handlers = buildArtifactEditHandlers();
    useWorkspaceStore.getState().setArtifactGenerated(key, "v1");
    handlers[key].onSave("v2-manual");
    handlers[key].onAiEdited("v3-ai");

    const rec = useWorkspaceStore.getState().artifacts[key]!;
    expect(rec.versions.map((v) => v.source)).toEqual(["generated", "manual-edit", "ai-edit"]);
    expect(rec.versions.map((v) => v.content)).toEqual(["v1", "v2-manual", "v3-ai"]);
  });
});
