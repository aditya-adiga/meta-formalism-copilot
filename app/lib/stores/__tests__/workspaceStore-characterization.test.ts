/**
 * Characterization baseline for the CURRENT localStorage persistence behavior
 * (DD-009 sub-task S1, test-strategy G16).
 *
 * This is the equivalence target: when the corpus/OPFS path is wired (S4), the
 * round-trip it produces must match what this test locks in. It asserts the
 * existing behavior as-is — if a change to the store breaks one of these, that's
 * a deliberate decision to make, not a silent drift.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";
import type { ArtifactRecord } from "@/app/lib/types/artifactStore";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";

const STORE_KEY = "workspace-zustand-v1";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
});

afterEach(() => {
  vi.useRealTimers();
});

function threeVersionRecord(): ArtifactRecord {
  return {
    type: "causal-graph",
    currentVersionIndex: 2,
    versions: [
      { id: "v1", content: '{"variables":["a"]}', createdAt: "2026-01-01T00:00:00Z", source: "generated" },
      { id: "v2", content: '{"variables":["a","b"]}', createdAt: "2026-01-02T00:00:00Z", source: "ai-edit", editInstruction: "add b" },
      { id: "v3", content: '{"variables":["a","b","c"]}', createdAt: "2026-01-03T00:00:00Z", source: "manual-edit" },
    ],
  };
}

function customTypes(): { defs: CustomArtifactTypeDefinition[]; data: Record<string, string | null> } {
  const defs: CustomArtifactTypeDefinition[] = [
    { id: "custom-eth", name: "Ethical Analysis", chipLabel: "Ethics", description: "d", whenToUse: "w", systemPrompt: "p1", outputFormat: "text", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    { id: "custom-risk", name: "Risk Map", chipLabel: "Risk", description: "d", whenToUse: "w", systemPrompt: "p2", outputFormat: "json", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  ];
  const data: Record<string, string | null> = { "custom-eth": "eth output", "custom-risk": '{"risks":[]}' };
  return { defs, data };
}

describe("current localStorage persistence — characterization (G16)", () => {
  it("persists a 3-version artifact record with all versions and currentVersionIndex intact", async () => {
    useWorkspaceStore.setState({ artifacts: { "causal-graph": threeVersionRecord() } });
    vi.advanceTimersByTime(300); // flush debounced write

    const raw = localStorage.getItem(STORE_KEY);
    expect(raw).not.toBeNull();
    const rec = JSON.parse(raw!).state.artifacts["causal-graph"] as ArtifactRecord;
    // Diagnostic: full record is serialized, not flattened to current version.
    expect(rec.versions).toHaveLength(3);
    expect(rec.currentVersionIndex).toBe(2);
    expect(rec.versions.map((v) => v.content)).toEqual([
      '{"variables":["a"]}',
      '{"variables":["a","b"]}',
      '{"variables":["a","b","c"]}',
    ]);
  });

  it("persists custom artifact type definitions and their generated data", async () => {
    const { defs, data } = customTypes();
    useWorkspaceStore.setState({ customArtifactTypes: defs, customArtifactData: data });
    vi.advanceTimersByTime(300);

    const state = JSON.parse(localStorage.getItem(STORE_KEY)!).state;
    expect(state.customArtifactTypes).toHaveLength(2);
    expect(state.customArtifactData["custom-eth"]).toBe("eth output");
    expect(state.customArtifactData["custom-risk"]).toBe('{"risks":[]}');
  });

  it("sanitizes transient verificationStatus 'verifying' to 'none' on persist", async () => {
    useWorkspaceStore.getState().setVerificationStatus("verifying");
    vi.advanceTimersByTime(300);
    const state = JSON.parse(localStorage.getItem(STORE_KEY)!).state;
    expect(state.verificationStatus).toBe("none");
  });

  it("rehydrates a full round-trip: versions and custom types survive a reload", async () => {
    const { defs, data } = customTypes();
    useWorkspaceStore.setState({
      sourceText: "src",
      artifacts: { "causal-graph": threeVersionRecord() },
      customArtifactTypes: defs,
      customArtifactData: data,
    });
    vi.advanceTimersByTime(300);

    // Simulate a reload: drop in-memory state, then rehydrate from localStorage.
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
    await useWorkspaceStore.persist.rehydrate();

    const s = useWorkspaceStore.getState();
    expect(s.sourceText).toBe("src");
    expect(s.getArtifactContent("causal-graph")).toBe('{"variables":["a","b","c"]}');
    expect(s.artifacts["causal-graph"]?.versions).toHaveLength(3);
    expect(s.customArtifactTypes).toHaveLength(2);
    expect(s.customArtifactData["custom-eth"]).toBe("eth output");
  });
});
