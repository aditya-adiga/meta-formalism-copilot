/**
 * SPIKE: Validate Zustand store for workspace state management.
 *
 * Tests:
 * 1. Basic state get/set
 * 2. Artifact versioning (generate, edit, undo, redo)
 * 3. Snapshot/restore (workspace sessions)
 * 4. PipelineAccessors compatibility
 * 5. Selective subscriptions (React component won't re-render for unrelated changes)
 * 6. persist middleware hydration
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";
import type { PipelineAccessors } from "@/app/hooks/useFormalizationPipeline";

// Reset store between tests
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
      // Generate v1
      store.setArtifactGenerated("causal-graph", "v1-generated");
      // User edits → v2
      store.setArtifactEdited("causal-graph", "v2-edited", "ai-edit", "add node X");
      // Regenerate → v3
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

      // Undo to v2, then make a new edit → v3 is gone
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
      // Latest should still be the last one
      expect(store.getArtifactContent("causal-graph")).toBe("v24");
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

      // Clear everything
      store.clearWorkspace();
      expect(store.getArtifactContent("causal-graph")).toBeNull();
      expect(useWorkspaceStore.getState().sourceText).toBe("");

      // Restore
      store.resetToSnapshot(snapshot);
      expect(useWorkspaceStore.getState().sourceText).toBe("my source");
      expect(store.getArtifactContent("causal-graph")).toBe("graph-data");
      expect(useWorkspaceStore.getState().semiformalText).toBe("proof text");
    });

    it("snapshot is a deep copy (mutations don't affect store)", () => {
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("causal-graph", "original");
      const snapshot = store.getSnapshot();

      // Mutate store after snapshot
      store.setArtifactEdited("causal-graph", "mutated", "manual-edit");

      // Snapshot should still have original
      expect(snapshot.artifacts["causal-graph"]!.versions).toHaveLength(1);
      expect(snapshot.artifacts["causal-graph"]!.versions[0].content).toBe("original");
    });
  });

  // -------------------------------------------------------------------------
  // 4. PipelineAccessors compatibility
  // -------------------------------------------------------------------------
  describe("pipeline accessors", () => {
    it("can build PipelineAccessors from store methods", () => {
      // This is the pattern page.tsx would use: build accessors from store
      const store = useWorkspaceStore.getState();

      const accessors: PipelineAccessors = {
        getSemiformal: () => useWorkspaceStore.getState().semiformalText,
        setSemiformal: (text) => useWorkspaceStore.getState().setSemiformalText(text),
        getLeanCode: () => useWorkspaceStore.getState().leanCode,
        setLeanCode: (code) => useWorkspaceStore.getState().setLeanCode(code),
        setVerificationStatus: (s) => useWorkspaceStore.getState().setVerificationStatus(s),
        getVerificationErrors: () => useWorkspaceStore.getState().verificationErrors,
        setVerificationErrors: (e) => useWorkspaceStore.getState().setVerificationErrors(e),
      };

      // Simulate pipeline usage
      accessors.setSemiformal("proof step 1");
      expect(accessors.getSemiformal()).toBe("proof step 1");

      accessors.setLeanCode("theorem foo : True := trivial");
      expect(accessors.getLeanCode()).toBe("theorem foo : True := trivial");

      accessors.setVerificationStatus("valid");
      expect(useWorkspaceStore.getState().verificationStatus).toBe("valid");
    });

    it("accessors always read fresh state (no stale closures)", () => {
      // Key advantage over useState: getState() always returns latest
      const accessors: PipelineAccessors = {
        getSemiformal: () => useWorkspaceStore.getState().semiformalText,
        setSemiformal: (text) => useWorkspaceStore.getState().setSemiformalText(text),
        getLeanCode: () => useWorkspaceStore.getState().leanCode,
        setLeanCode: (code) => useWorkspaceStore.getState().setLeanCode(code),
        setVerificationStatus: (s) => useWorkspaceStore.getState().setVerificationStatus(s),
        getVerificationErrors: () => useWorkspaceStore.getState().verificationErrors,
        setVerificationErrors: (e) => useWorkspaceStore.getState().setVerificationErrors(e),
      };

      // External code changes state
      useWorkspaceStore.getState().setSemiformalText("externally set");

      // Accessor sees the change immediately (no stale closure!)
      expect(accessors.getSemiformal()).toBe("externally set");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Selective subscriptions
  // -------------------------------------------------------------------------
  describe("selective subscriptions", () => {
    it("subscribe fires for all state changes (use useStore selector in React for selective re-renders)", () => {
      const listener = vi.fn();

      // Zustand v5: vanilla subscribe fires on every change.
      // Selective re-renders happen in React via useStore(store, selector).
      // This test validates that the subscribe API works and that
      // React components should use selectors for performance.
      const unsub = useWorkspaceStore.subscribe(listener);

      useWorkspaceStore.getState().setSourceText("changed");
      expect(listener).toHaveBeenCalledTimes(1);

      // Vanilla subscribe fires for all changes — this is expected.
      // React: useWorkspaceStore((s) => s.sourceText) only re-renders
      // when sourceText changes, not when contextText changes.
      useWorkspaceStore.getState().setContextText("other change");
      expect(listener).toHaveBeenCalledTimes(2);

      unsub();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Backward-compatible artifact access pattern
  // -------------------------------------------------------------------------
  describe("backward compat shim", () => {
    it("getArtifactContent returns null for missing artifacts", () => {
      const store = useWorkspaceStore.getState();
      expect(store.getArtifactContent("causal-graph")).toBeNull();
      expect(store.getArtifactContent("statistical-model")).toBeNull();
    });

    it("can simulate the old setter pattern via setArtifactGenerated", () => {
      // Old pattern: setPersistedCausalGraph('{"data": "..."}')
      // New pattern: setArtifactGenerated("causal-graph", '{"data": "..."}')
      const store = useWorkspaceStore.getState();
      store.setArtifactGenerated("causal-graph", '{"variables":[],"edges":[]}');

      // Old read pattern: parseJson(persistedCausalGraph)
      // New: getArtifactContent("causal-graph") then JSON.parse
      const content = store.getArtifactContent("causal-graph");
      expect(content).not.toBeNull();
      const parsed = JSON.parse(content!);
      expect(parsed.variables).toEqual([]);
      expect(parsed.edges).toEqual([]);
    });
  });
});
