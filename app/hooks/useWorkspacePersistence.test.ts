import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { WORKSPACE_KEY } from "@/app/lib/types/persistence";
import { useWorkspaceStore } from "@/app/lib/stores/workspaceStore";

const ZUSTAND_KEY = "workspace-zustand-v1";

describe("useWorkspacePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset Zustand store to defaults between tests
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
  });

  it("starts with default values when localStorage is empty", () => {
    const { result } = renderHook(() => useWorkspacePersistence());
    expect(result.current.sourceText).toBe("");
    expect(result.current.extractedFiles).toEqual([]);
    expect(result.current.contextText).toBe("");
    expect(result.current.semiformalText).toBe("");
    expect(result.current.leanCode).toBe("");
    expect(result.current.semiformalDirty).toBe(false);
    expect(result.current.verificationStatus).toBe("none");
    expect(result.current.verificationErrors).toBe("");
    expect(result.current.restoredDecompState).toBeNull();
  });

  it("restores saved values on mount via Zustand rehydration", async () => {
    // Pre-populate Zustand's localStorage key (the format Zustand persist uses)
    const saved = {
      state: {
        sourceText: "restored source",
        extractedFiles: [{ name: "f.txt", text: "content" }],
        contextText: "restored ctx",
        semiformalText: "restored semi",
        leanCode: "restored lean",
        semiformalDirty: true,
        verificationStatus: "valid",
        verificationErrors: "some error",
        artifacts: {},
        decomposition: {
          nodes: [{ id: "1", label: "T", kind: "theorem", statement: "", proofText: "", dependsOn: [], sourceId: "", sourceLabel: "", semiformalProof: "", leanCode: "", verificationStatus: "verified", verificationErrors: "", context: "", selectedArtifactTypes: [], artifacts: [] }],
          selectedNodeId: "1",
          paperText: "paper",
          sources: [],
        },
      },
      version: 0,
    };
    localStorage.setItem(ZUSTAND_KEY, JSON.stringify(saved));

    // Rehydrate store (simulates what the shim's useEffect does)
    await useWorkspaceStore.persist.rehydrate();

    const { result } = renderHook(() => useWorkspacePersistence());

    expect(result.current.sourceText).toBe("restored source");
    expect(result.current.extractedFiles).toEqual([{ name: "f.txt", text: "content" }]);
    expect(result.current.verificationStatus).toBe("valid");
  });

  it("migrates workspace-v2 data on rehydrate", async () => {
    // Pre-populate old workspace-v2 key
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({
      version: 2,
      sourceText: "migrated source",
      extractedFiles: [],
      contextText: "",
      semiformalText: "migrated proof",
      leanCode: "",
      semiformalDirty: false,
      verificationStatus: "none",
      verificationErrors: "",
      decomposition: { nodes: [], selectedNodeId: null, paperText: "", sources: [] },
      causalGraph: '{"variables":[]}',
      statisticalModel: null,
      propertyTests: null,
      dialecticalMap: null,
      counterexamples: null,
    }));

    // Trigger rehydrate — the onRehydrateStorage callback should detect
    // workspace-v2 and call migrateFromV2
    await useWorkspaceStore.persist.rehydrate();

    const store = useWorkspaceStore.getState();
    expect(store.sourceText).toBe("migrated source");
    expect(store.semiformalText).toBe("migrated proof");
    expect(store.getArtifactContent("causal-graph")).toBe('{"variables":[]}');
  });

  it("persist middleware saves to Zustand key on state change", async () => {
    await useWorkspaceStore.persist.rehydrate();

    const { result } = renderHook(() => useWorkspacePersistence());

    act(() => {
      result.current.setSourceText("abc");
    });

    // Zustand persist writes synchronously on set()
    const raw = localStorage.getItem(ZUSTAND_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.state.sourceText).toBe("abc");
  });

  it("falls back to defaults on corrupted localStorage", () => {
    // Corrupted old key shouldn't crash; store stays at defaults
    localStorage.setItem(WORKSPACE_KEY, "corrupted{{{not json");
    const { result } = renderHook(() => useWorkspacePersistence());
    expect(result.current.sourceText).toBe("");
    expect(result.current.restoredDecompState).toBeNull();
  });
});
