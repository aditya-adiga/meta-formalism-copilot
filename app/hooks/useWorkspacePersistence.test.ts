import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { WORKSPACE_KEY } from "@/app/lib/types/persistence";

describe("useWorkspacePersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("restores saved values on mount", () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({
      version: 1,
      sourceText: "restored source",
      extractedFiles: [{ name: "f.txt", text: "content" }],
      contextText: "restored ctx",
      semiformalText: "restored semi",
      leanCode: "restored lean",
      semiformalDirty: true,
      verificationStatus: "valid",
      verificationErrors: "some error",
      decomposition: {
        nodes: [{ id: "1", label: "T", kind: "theorem", statement: "", proofText: "", dependsOn: [], semiformalProof: "", leanCode: "", verificationStatus: "verified", verificationErrors: "" }],
        selectedNodeId: "1",
        paperText: "paper",
      },
    }));

    const { result } = renderHook(() => useWorkspacePersistence());

    expect(result.current.sourceText).toBe("restored source");
    expect(result.current.extractedFiles).toEqual([{ name: "f.txt", text: "content" }]);
    expect(result.current.verificationStatus).toBe("valid");
    expect(result.current.restoredDecompState).not.toBeNull();
    expect(result.current.restoredDecompState!.nodes).toHaveLength(1);
  });

  it("saves after 500ms debounce", () => {
    const { result } = renderHook(() => useWorkspacePersistence());

    act(() => {
      result.current.setSourceText("a");
    });
    act(() => {
      result.current.setSourceText("ab");
    });
    act(() => {
      result.current.setSourceText("abc");
    });

    // Before debounce fires, nothing saved
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(600);
    });

    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
    expect(stored.sourceText).toBe("abc");
  });

  it("falls back to defaults on corrupted localStorage", () => {
    localStorage.setItem(WORKSPACE_KEY, "corrupted{{{not json");
    const { result } = renderHook(() => useWorkspacePersistence());
    expect(result.current.sourceText).toBe("");
    expect(result.current.restoredDecompState).toBeNull();
  });
});
