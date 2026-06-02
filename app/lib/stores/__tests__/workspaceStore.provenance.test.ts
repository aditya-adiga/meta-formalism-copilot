/**
 * Workspace store provenance integration tests.
 *
 * Covers:
 * 1. setArtifactGenerated stores provenance on the version
 * 2. setArtifactsBatchGenerated stores provenance on all versions
 * 3. Missing provenance → treated as not stale (backward compat)
 * 4. semiformalProvenance get/set
 * 5. Provenance survives snapshot/restore
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore, resolveArtifactProvenance } from "../workspaceStore";
import { buildProvenance } from "@/app/lib/utils/provenance";

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
});

describe("artifact provenance", () => {
  const provenance = buildProvenance("source text", "context");

  it("setArtifactGenerated stores provenance on the version", () => {
    useWorkspaceStore.getState().setArtifactGenerated("causal-graph", '{"nodes":[]}', provenance);
    const rec = useWorkspaceStore.getState().artifacts["causal-graph"];
    expect(rec).toBeDefined();
    expect(rec!.versions[0].provenance).toEqual(provenance);
  });

  it("setArtifactsBatchGenerated stores provenance on all versions", () => {
    useWorkspaceStore.getState().setArtifactsBatchGenerated(
      [
        { key: "causal-graph", content: '{"nodes":[]}' },
        { key: "property-tests", content: '{"tests":[]}' },
      ],
      provenance,
    );
    const cg = useWorkspaceStore.getState().artifacts["causal-graph"];
    const pt = useWorkspaceStore.getState().artifacts["property-tests"];
    expect(cg!.versions[0].provenance).toEqual(provenance);
    expect(pt!.versions[0].provenance).toEqual(provenance);
  });

  it("resolveArtifactProvenance returns current version provenance", () => {
    useWorkspaceStore.getState().setArtifactGenerated("causal-graph", "v1", provenance);
    const rec = useWorkspaceStore.getState().artifacts["causal-graph"];
    expect(resolveArtifactProvenance(rec)).toEqual(provenance);
  });

  it("resolveArtifactProvenance returns undefined for missing record", () => {
    expect(resolveArtifactProvenance(undefined)).toBeUndefined();
  });

  it("versions without provenance return undefined (backward compat)", () => {
    // Generate without provenance (like pre-existing data)
    useWorkspaceStore.getState().setArtifactGenerated("causal-graph", "v1");
    const rec = useWorkspaceStore.getState().artifacts["causal-graph"];
    expect(resolveArtifactProvenance(rec)).toBeUndefined();
  });

  it("undo shows older version provenance", () => {
    const prov1 = buildProvenance("input1", "ctx1");
    const prov2 = buildProvenance("input2", "ctx2");
    useWorkspaceStore.getState().setArtifactGenerated("causal-graph", "v1", prov1);
    useWorkspaceStore.getState().setArtifactGenerated("causal-graph", "v2", prov2);

    // Current version has prov2
    let rec = useWorkspaceStore.getState().artifacts["causal-graph"];
    expect(resolveArtifactProvenance(rec)?.inputHash).toBe(prov2.inputHash);

    // After undo, shows prov1
    useWorkspaceStore.getState().undoArtifact("causal-graph");
    rec = useWorkspaceStore.getState().artifacts["causal-graph"];
    expect(resolveArtifactProvenance(rec)?.inputHash).toBe(prov1.inputHash);
  });
});

describe("semiformalProvenance", () => {
  it("defaults to null", () => {
    expect(useWorkspaceStore.getState().semiformalProvenance).toBeNull();
  });

  it("can be set and read", () => {
    const prov = buildProvenance("src", "ctx");
    useWorkspaceStore.getState().setSemiformalProvenance(prov);
    expect(useWorkspaceStore.getState().semiformalProvenance).toEqual(prov);
  });

  it("survives snapshot/restore", () => {
    const prov = buildProvenance("src", "ctx");
    useWorkspaceStore.getState().setSemiformalProvenance(prov);
    const snapshot = useWorkspaceStore.getState().getSnapshot();

    useWorkspaceStore.getState().clearWorkspace();
    expect(useWorkspaceStore.getState().semiformalProvenance).toBeNull();

    useWorkspaceStore.getState().resetToSnapshot(snapshot);
    expect(useWorkspaceStore.getState().semiformalProvenance).toEqual(prov);
  });
});
