/**
 * SPIKE: Test SSR hydration and migration from workspace-v2.
 *
 * Uses jsdom's built-in localStorage (vitest default env).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
});

describe("SSR hydration", () => {
  it("starts with defaults before hydration (SSR safe)", () => {
    const state = useWorkspaceStore.getState();
    expect(state.sourceText).toBe("");
    expect(state.artifacts).toEqual({});
  });

  it("rehydrates from localStorage on rehydrate() call", async () => {
    // Pre-populate localStorage with saved state (Zustand persist format)
    const saved = {
      state: {
        sourceText: "persisted source",
        extractedFiles: [],
        contextText: "persisted context",
        semiformalText: "",
        leanCode: "",
        semiformalDirty: false,
        verificationStatus: "none",
        verificationErrors: "",
        artifacts: {
          "causal-graph": {
            type: "causal-graph",
            currentVersionIndex: 0,
            versions: [{
              id: "test-id",
              content: '{"variables":[]}',
              createdAt: "2025-01-01T00:00:00Z",
              source: "generated",
            }],
          },
        },
        decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
      },
      version: 0,
    };
    localStorage.setItem("workspace-zustand-v1", JSON.stringify(saved));

    // Rehydrate (this is what useEffect would call in a component)
    await useWorkspaceStore.persist.rehydrate();

    const state = useWorkspaceStore.getState();
    expect(state.sourceText).toBe("persisted source");
    expect(state.contextText).toBe("persisted context");
    expect(state.getArtifactContent("causal-graph")).toBe('{"variables":[]}');
  });

  it("persist middleware auto-saves on state change after hydration", async () => {
    // First rehydrate (activates the persist listener)
    await useWorkspaceStore.persist.rehydrate();

    // Make a change
    useWorkspaceStore.getState().setSourceText("auto-saved");

    // Check localStorage was updated
    const raw = localStorage.getItem("workspace-zustand-v1");
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.state.sourceText).toBe("auto-saved");
  });

  it("persisted data excludes action functions", async () => {
    await useWorkspaceStore.persist.rehydrate();
    useWorkspaceStore.getState().setSourceText("test");

    const stored = JSON.parse(localStorage.getItem("workspace-zustand-v1")!);
    // Should not contain function keys
    expect(stored.state.setSourceText).toBeUndefined();
    expect(stored.state.setArtifactGenerated).toBeUndefined();
    expect(stored.state.getSnapshot).toBeUndefined();
  });
});

describe("migration from workspace-v2", () => {
  it("can migrate old flat artifact fields to versioned store", () => {
    const oldWorkspace = {
      version: 2,
      sourceText: "old source",
      extractedFiles: [],
      contextText: "old context",
      semiformalText: "old proof",
      leanCode: "old lean",
      semiformalDirty: false,
      verificationStatus: "none" as const,
      verificationErrors: "",
      decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
      causalGraph: '{"variables":[],"edges":[]}',
      statisticalModel: null,
      propertyTests: '{"tests":[]}',
      balancedPerspectives: null,
      counterexamples: null,
    };

    // Migration function
    function migrateFromV2(old: typeof oldWorkspace) {
      const store = useWorkspaceStore.getState();
      store.setSourceText(old.sourceText);
      store.setContextText(old.contextText);
      store.setSemiformalText(old.semiformalText);
      store.setLeanCode(old.leanCode);
      store.setVerificationStatus(old.verificationStatus);
      store.setVerificationErrors(old.verificationErrors);
      store.setDecomposition(old.decomposition);

      const artifactMap: Record<string, string | null> = {
        "causal-graph": old.causalGraph,
        "statistical-model": old.statisticalModel,
        "property-tests": old.propertyTests,
        "balanced-perspectives": old.balancedPerspectives,
        counterexamples: old.counterexamples,
      };

      for (const [key, content] of Object.entries(artifactMap)) {
        if (content) {
          store.setArtifactGenerated(key as "causal-graph", content);
        }
      }
    }

    migrateFromV2(oldWorkspace);

    const store = useWorkspaceStore.getState();
    expect(store.sourceText).toBe("old source");
    expect(store.getArtifactContent("causal-graph")).toBe('{"variables":[],"edges":[]}');
    expect(store.getArtifactContent("property-tests")).toBe('{"tests":[]}');
    expect(store.getArtifactContent("statistical-model")).toBeNull();

    const cgRec = store.artifacts["causal-graph"]!;
    expect(cgRec.versions).toHaveLength(1);
    expect(cgRec.versions[0].source).toBe("generated");
  });
});
