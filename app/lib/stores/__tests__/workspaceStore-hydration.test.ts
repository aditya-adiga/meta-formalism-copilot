/**
 * Tests for SSR hydration and migration from workspace-v2 format.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore, migrateFromV2 } from "../workspaceStore";
import { WORKSPACE_KEY } from "@/app/lib/types/persistence";

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

    await useWorkspaceStore.persist.rehydrate();

    const state = useWorkspaceStore.getState();
    expect(state.sourceText).toBe("persisted source");
    expect(state.contextText).toBe("persisted context");
    expect(state.getArtifactContent("causal-graph")).toBe('{"variables":[]}');
  });

  it("persist middleware auto-saves on state change after hydration", async () => {
    await useWorkspaceStore.persist.rehydrate();

    useWorkspaceStore.getState().setSourceText("auto-saved");

    const raw = localStorage.getItem("workspace-zustand-v1");
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.state.sourceText).toBe("auto-saved");
  });

  it("persisted data excludes action functions", async () => {
    await useWorkspaceStore.persist.rehydrate();
    useWorkspaceStore.getState().setSourceText("test");

    const stored = JSON.parse(localStorage.getItem("workspace-zustand-v1")!);
    expect(stored.state.setSourceText).toBeUndefined();
    expect(stored.state.setArtifactGenerated).toBeUndefined();
    expect(stored.state.getSnapshot).toBeUndefined();
  });
});

describe("migration from workspace-v2", () => {
  it("migrates old flat artifact fields to versioned store", () => {
    // Simulate old workspace-v2 data in localStorage
    const oldData = {
      version: 2,
      sourceText: "old source",
      extractedFiles: [{ name: "test.txt", text: "file content" }],
      contextText: "old context",
      semiformalText: "old proof",
      leanCode: "old lean",
      semiformalDirty: false,
      verificationStatus: "none",
      verificationErrors: "",
      decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
      causalGraph: '{"variables":[],"edges":[]}',
      statisticalModel: null,
      propertyTests: '{"tests":[]}',
      dialecticalMap: '{"positions":[]}',
      counterexamples: null,
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(oldData));

    const success = migrateFromV2();
    expect(success).toBe(true);

    const store = useWorkspaceStore.getState();
    expect(store.sourceText).toBe("old source");
    expect(store.contextText).toBe("old context");
    expect(store.semiformalText).toBe("old proof");
    expect(store.leanCode).toBe("old lean");
    expect(store.extractedFiles).toEqual([{ name: "test.txt", text: "file content" }]);

    expect(store.getArtifactContent("causal-graph")).toBe('{"variables":[],"edges":[]}');
    expect(store.getArtifactContent("property-tests")).toBe('{"tests":[]}');
    expect(store.getArtifactContent("dialectical-map")).toBe('{"positions":[]}');
    expect(store.getArtifactContent("statistical-model")).toBeNull();
    expect(store.getArtifactContent("counterexamples")).toBeNull();

    // Migrated artifacts should have a single "generated" version
    const cgRec = store.artifacts["causal-graph"]!;
    expect(cgRec.versions).toHaveLength(1);
    expect(cgRec.versions[0].source).toBe("generated");
  });

  it("returns false when no workspace-v2 data exists", () => {
    const success = migrateFromV2();
    expect(success).toBe(false);
  });

  it("preserves decomposition state during migration", () => {
    const nodes = [{
      id: "n1",
      label: "Prop 1",
      kind: "proposition",
      statement: "test statement",
      proofText: "",
      dependsOn: [],
      sourceId: "doc-0",
      sourceLabel: "Text Input",
      semiformalProof: "",
      leanCode: "",
      verificationStatus: "unverified",
      verificationErrors: "",
      context: "",
      selectedArtifactTypes: [],
      artifacts: [],
    }];
    const oldData = {
      version: 2,
      sourceText: "",
      extractedFiles: [],
      contextText: "",
      semiformalText: "",
      leanCode: "",
      semiformalDirty: false,
      verificationStatus: "none",
      verificationErrors: "",
      decomposition: { nodes, selectedNodeId: "n1", paperText: "test paper", sources: [] },
      causalGraph: null,
      statisticalModel: null,
      propertyTests: null,
      dialecticalMap: null,
      counterexamples: null,
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(oldData));

    migrateFromV2();

    const store = useWorkspaceStore.getState();
    expect(store.decomposition.nodes).toHaveLength(1);
    expect(store.decomposition.nodes[0].id).toBe("n1");
    expect(store.decomposition.selectedNodeId).toBe("n1");
    expect(store.decomposition.paperText).toBe("test paper");
  });
});
