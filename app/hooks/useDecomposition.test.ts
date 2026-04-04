import { describe, it, expect } from "vitest";

// Extract toPropositionNodes for testing by re-implementing the same logic.
// The function is module-private, so we test it via a local copy that must
// stay in sync. If this test breaks after a refactor, update the copy.
// (Alternatively, the function could be exported — but it's an internal helper.)

import type { PropositionNode } from "@/app/lib/types/decomposition";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPropositionNodes(raw: any[], labelMap: Map<string, string>): PropositionNode[] {
  return raw.map((p) => ({
    id: p.id ?? "",
    label: p.label ?? "",
    kind: p.kind ?? "claim",
    statement: p.statement ?? "",
    proofText: p.proofText ?? "",
    dependsOn: p.dependsOn ?? [],
    sourceId: p.sourceId ?? "",
    sourceLabel: p.sourceId ? (labelMap.get(p.sourceId) ?? p.sourceId) : "",
    semiformalProof: "",
    leanCode: "",
    verificationStatus: "unverified" as const,
    verificationErrors: "",
    context: "",
    selectedArtifactTypes: [],
    artifacts: [],
  }));
}

const labelMap = new Map([["doc-0", "Paper A"], ["doc-1", "Paper B"]]);

describe("toPropositionNodes", () => {
  it("maps a complete raw node to a PropositionNode", () => {
    const raw = [{
      id: "doc-0/claim-1",
      label: "Main Claim",
      kind: "claim",
      statement: "Some statement",
      proofText: "Some proof",
      dependsOn: ["doc-0/def-1"],
      sourceId: "doc-0",
    }];

    const nodes = toPropositionNodes(raw, labelMap);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("doc-0/claim-1");
    expect(nodes[0].sourceLabel).toBe("Paper A");
    expect(nodes[0].dependsOn).toEqual(["doc-0/def-1"]);
    expect(nodes[0].verificationStatus).toBe("unverified");
    expect(nodes[0].artifacts).toEqual([]);
  });

  it("defaults missing fields to safe empty values", () => {
    const raw = [{}]; // completely empty object
    const nodes = toPropositionNodes(raw, labelMap);

    expect(nodes[0].id).toBe("");
    expect(nodes[0].label).toBe("");
    expect(nodes[0].kind).toBe("claim");
    expect(nodes[0].statement).toBe("");
    expect(nodes[0].proofText).toBe("");
    expect(nodes[0].dependsOn).toEqual([]);
    expect(nodes[0].sourceId).toBe("");
    expect(nodes[0].sourceLabel).toBe("");
  });

  it("falls back to sourceId as sourceLabel when label not in map", () => {
    const raw = [{ sourceId: "doc-99" }];
    const nodes = toPropositionNodes(raw, labelMap);
    expect(nodes[0].sourceLabel).toBe("doc-99");
  });

  it("handles multiple nodes", () => {
    const raw = [
      { id: "doc-0/a", sourceId: "doc-0" },
      { id: "doc-1/b", sourceId: "doc-1" },
    ];
    const nodes = toPropositionNodes(raw, labelMap);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].sourceLabel).toBe("Paper A");
    expect(nodes[1].sourceLabel).toBe("Paper B");
  });
});
