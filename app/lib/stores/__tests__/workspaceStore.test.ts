/**
 * Workspace Zustand store tests.
 *
 * Covers:
 * 1. Basic state get/set
 * 2. Artifact versioning (generate, edit, undo, redo, cap)
 * 3. Snapshot/restore (workspace sessions)
 * 4. PipelineAccessors compatibility
 * 5. Selective subscriptions
 * 6. Backward-compatible artifact access
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";
import type { PipelineAccessors } from "@/app/hooks/useFormalizationPipeline";

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
});

describe("workspaceStore", () => {
  // -------------------------------------------------------------------------
  // 1. Basic state
  // -------------------------------------------------------------------------
  it("initializes with defaults", () => {
    const state = useWorkspaceStore.getState();
    expect(state.sourceText).toBe("");
    expect(state.artifacts).toEqual({});
    expect(state.decomposition.nodes).toEqual([]);
  });

  it("updates simple fields", () => {
    const { setSourceText, setContextText } = useWorkspaceStore.getState();
    setSourceText("hello");
    setContextText("world");
    expect(useWorkspaceStore.getState().sourceText).toBe("hello");
    expect(useWorkspaceStore.getState().contextText).toBe("world");
  });

  it("supports functional updates for semiformal/lean", () => {
    const { setSemiformalText, setLeanCode } = useWorkspaceStore.getState();
    setSemiformalText("base");
    setSemiformalText((prev) => prev + " appended");
    expect(useWorkspaceStore.getState().semiformalText).toBe("base appended");

    setLeanCode("theorem");
    setLeanCode((prev) => prev + " p");
    expect(useWorkspaceStore.getState().leanCode).toBe("theorem p");
  });

  it("supports functional updates for semiformalDirty", () => {
    const { setSemiformalDirty } = useWorkspaceStore.getState();
    setSemiformalDirty(false);
    expect(useWorkspaceStore.getState().semiformalDirty).toBe(false);

    setSemiformalDirty((prev) => !prev);
    expect(useWorkspaceStore.getState().semiformalDirty).toBe(true);

    setSemiformalDirty((prev) => prev || false);
    expect(useWorkspaceStore.getState().semiformalDirty).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Artifact versioning
  // -------------------------------------------------------------------------
  describe("artifact versioning", () => {
    it("creates a record on first generation", () => {
      const { setArtifactGenerated, getArtifactContent } = useWorkspaceStore.getState();
      setArtifactGenerated("causal-graph", '{"variables":[]}');
      expect(getArtifactContent("causal-graph")).toBe('{"variables":[]}');
      expect(useWorkspaceStore.getState().artifacts["causal-graph"]!.versions).toHaveLength(1);
    });

    it("preserves edit history across regeneration", () => {
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("causal-graph", "v1-generated");
      store.setArtifactEdited("causal-graph", "v2-edited", "ai-edit", "add node X");
      store.setArtifactGenerated("causal-graph", "v3-regenerated");

      const rec = useWorkspaceStore.getState().artifacts["causal-graph"]!;
      expect(rec.versions).toHaveLength(3);
      expect(rec.versions[0].content).toBe("v1-generated");
      expect(rec.versions[1].content).toBe("v2-edited");
      expect(rec.versions[1].source).toBe("ai-edit");
      expect(rec.versions[1].editInstruction).toBe("add node X");
      expect(rec.versions[2].content).toBe("v3-regenerated");
      expect(store.getArtifactContent("causal-graph")).toBe("v3-regenerated");
    });

    it("supports undo and redo", () => {
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("causal-graph", "v1");
      store.setArtifactEdited("causal-graph", "v2", "manual-edit");
      store.setArtifactEdited("causal-graph", "v3", "manual-edit");

      expect(store.getArtifactContent("causal-graph")).toBe("v3");
      expect(store.canUndo("causal-graph")).toBe(true);
      expect(store.canRedo("causal-graph")).toBe(false);

      store.undoArtifact("causal-graph");
      expect(store.getArtifactContent("causal-graph")).toBe("v2");
      expect(store.canUndo("causal-graph")).toBe(true);
      expect(store.canRedo("causal-graph")).toBe(true);

      store.undoArtifact("causal-graph");
      expect(store.getArtifactContent("causal-graph")).toBe("v1");
      expect(store.canUndo("causal-graph")).toBe(false);

      store.redoArtifact("causal-graph");
      expect(store.getArtifactContent("causal-graph")).toBe("v2");
    });

    it("truncates redo history on new edit", () => {
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("causal-graph", "v1");
      store.setArtifactEdited("causal-graph", "v2", "manual-edit");
      store.setArtifactEdited("causal-graph", "v3", "manual-edit");

      store.undoArtifact("causal-graph");
      store.setArtifactEdited("causal-graph", "v2-fork", "manual-edit");

      const rec = useWorkspaceStore.getState().artifacts["causal-graph"]!;
      expect(rec.versions).toHaveLength(3); // v1, v2, v2-fork (v3 discarded)
      expect(store.getArtifactContent("causal-graph")).toBe("v2-fork");
      expect(store.canRedo("causal-graph")).toBe(false);
    });

    it("caps versions at 20", () => {
      const store = useWorkspaceStore.getState();
      for (let i = 0; i < 25; i++) {
        store.setArtifactGenerated("causal-graph", `v${i}`);
      }
      const rec = useWorkspaceStore.getState().artifacts["causal-graph"]!;
      expect(rec.versions.length).toBeLessThanOrEqual(20);
      expect(store.getArtifactContent("causal-graph")).toBe("v24");
    });

    it("works with balanced-perspectives artifact key", () => {
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("balanced-perspectives", '{"positions":[]}');
      expect(store.getArtifactContent("balanced-perspectives")).toBe('{"positions":[]}');

      store.setArtifactEdited("balanced-perspectives", '{"positions":["a"]}', "manual-edit");
      expect(store.getArtifactContent("balanced-perspectives")).toBe('{"positions":["a"]}');
      expect(store.canUndo("balanced-perspectives")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Snapshot/restore
  // -------------------------------------------------------------------------
  describe("snapshot/restore", () => {
    it("captures and restores full state", () => {
      const store = useWorkspaceStore.getState();
      store.setSourceText("my source");
      store.setContextText("my context");
      store.setArtifactGenerated("causal-graph", "graph-data");
      store.setSemiformalText("proof text");

      const snapshot = store.getSnapshot();

      store.clearWorkspace();
      expect(store.getArtifactContent("causal-graph")).toBeNull();
      expect(useWorkspaceStore.getState().sourceText).toBe("");

      store.resetToSnapshot(snapshot);
      expect(useWorkspaceStore.getState().sourceText).toBe("my source");
      expect(store.getArtifactContent("causal-graph")).toBe("graph-data");
      expect(useWorkspaceStore.getState().semiformalText).toBe("proof text");
    });

    it("snapshot is a deep copy (mutations don't affect store)", () => {
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("causal-graph", "original");
      const snapshot = store.getSnapshot();

      store.setArtifactEdited("causal-graph", "mutated", "manual-edit");

      expect(snapshot.artifacts["causal-graph"]!.versions).toHaveLength(1);
      expect(snapshot.artifacts["causal-graph"]!.versions[0].content).toBe("original");
    });
  });

  // -------------------------------------------------------------------------
  // 4. PipelineAccessors compatibility
  // -------------------------------------------------------------------------
  describe("pipeline accessors", () => {
    it("can build PipelineAccessors from store methods", () => {
      const accessors: PipelineAccessors = {
        getSemiformal: () => useWorkspaceStore.getState().semiformalText,
        setSemiformal: (text) => useWorkspaceStore.getState().setSemiformalText(text),
        getLeanCode: () => useWorkspaceStore.getState().leanCode,
        setLeanCode: (code) => useWorkspaceStore.getState().setLeanCode(code),
        setVerificationStatus: (s) => useWorkspaceStore.getState().setVerificationStatus(s),
        getVerificationErrors: () => useWorkspaceStore.getState().verificationErrors,
        setVerificationErrors: (e) => useWorkspaceStore.getState().setVerificationErrors(e),
      };

      accessors.setSemiformal("proof step 1");
      expect(accessors.getSemiformal()).toBe("proof step 1");

      accessors.setLeanCode("theorem foo : True := trivial");
      expect(accessors.getLeanCode()).toBe("theorem foo : True := trivial");

      accessors.setVerificationStatus("valid");
      expect(useWorkspaceStore.getState().verificationStatus).toBe("valid");
    });

    it("accessors always read fresh state (no stale closures)", () => {
      const accessors: PipelineAccessors = {
        getSemiformal: () => useWorkspaceStore.getState().semiformalText,
        setSemiformal: (text) => useWorkspaceStore.getState().setSemiformalText(text),
        getLeanCode: () => useWorkspaceStore.getState().leanCode,
        setLeanCode: (code) => useWorkspaceStore.getState().setLeanCode(code),
        setVerificationStatus: (s) => useWorkspaceStore.getState().setVerificationStatus(s),
        getVerificationErrors: () => useWorkspaceStore.getState().verificationErrors,
        setVerificationErrors: (e) => useWorkspaceStore.getState().setVerificationErrors(e),
      };

      useWorkspaceStore.getState().setSemiformalText("externally set");
      expect(accessors.getSemiformal()).toBe("externally set");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Selective subscriptions
  // -------------------------------------------------------------------------
  describe("selective subscriptions", () => {
    it("subscribe fires for all state changes", () => {
      const listener = vi.fn();
      const unsub = useWorkspaceStore.subscribe(listener);

      useWorkspaceStore.getState().setSourceText("changed");
      expect(listener).toHaveBeenCalledTimes(1);

      useWorkspaceStore.getState().setContextText("other change");
      expect(listener).toHaveBeenCalledTimes(2);

      unsub();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Backward-compatible artifact access
  // -------------------------------------------------------------------------
  describe("backward compat", () => {
    it("getArtifactContent returns null for missing artifacts", () => {
      const store = useWorkspaceStore.getState();
      expect(store.getArtifactContent("causal-graph")).toBeNull();
      expect(store.getArtifactContent("statistical-model")).toBeNull();
      expect(store.getArtifactContent("balanced-perspectives")).toBeNull();
    });

    it("can simulate the old setter pattern via setArtifactGenerated", () => {
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("causal-graph", '{"variables":[],"edges":[]}');

      const content = store.getArtifactContent("causal-graph");
      expect(content).not.toBeNull();
      const parsed = JSON.parse(content!);
      expect(parsed.variables).toEqual([]);
      expect(parsed.edges).toEqual([]);
    });
  });
});
