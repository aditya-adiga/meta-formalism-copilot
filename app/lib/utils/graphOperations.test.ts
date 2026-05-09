import { describe, it, expect } from "vitest";
import {
  wouldCreateCycle,
  addNode,
  removeNode,
  renameNode,
  updateNodeStatement,
  addEdge,
  removeEdge,
} from "./graphOperations";
import type { PropositionNode } from "@/app/lib/types/decomposition";

/** Helper to build a minimal node for testing. */
function makeNode(id: string, dependsOn: string[] = []): PropositionNode {
  return {
    id,
    label: `Node ${id}`,
    kind: "claim",
    statement: "",
    proofText: "",
    dependsOn,
    sourceId: "",
    sourceLabel: "",
    semiformalProof: "",
    leanCode: "",
    verificationStatus: "unverified",
    verificationErrors: "",
    context: "",
    selectedArtifactTypes: [],
    artifacts: [],
  };
}

describe("wouldCreateCycle", () => {
  it("detects self-loop", () => {
    const nodes = [makeNode("A")];
    expect(wouldCreateCycle(nodes, "A", "A")).toBe(true);
  });

  it("detects direct cycle", () => {
    // A → B (B depends on A). Adding B → A would create A→B→A.
    const nodes = [makeNode("A"), makeNode("B", ["A"])];
    expect(wouldCreateCycle(nodes, "B", "A")).toBe(true);
  });

  it("detects indirect cycle", () => {
    // A → B → C. Adding C → A would create A→B→C→A.
    const nodes = [makeNode("A"), makeNode("B", ["A"]), makeNode("C", ["B"])];
    expect(wouldCreateCycle(nodes, "C", "A")).toBe(true);
  });

  it("allows valid edge", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C", ["A"])];
    // B → C is fine (C depends on B, no cycle)
    expect(wouldCreateCycle(nodes, "B", "C")).toBe(false);
  });

  it("allows edge between disconnected nodes", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    expect(wouldCreateCycle(nodes, "A", "B")).toBe(false);
  });
});

describe("addNode", () => {
  it("adds a node with defaults", () => {
    const [result, id] = addNode([], { label: "Test" });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Test");
    expect(result[0].kind).toBe("claim");
    expect(result[0].id).toBe(id);
    expect(id).toBeTruthy();
  });

  it("preserves existing nodes", () => {
    const existing = [makeNode("A")];
    const [result] = addNode(existing, { label: "B", kind: "lemma" });
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("A");
    expect(result[1].kind).toBe("lemma");
  });
});

describe("removeNode", () => {
  it("removes the node", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const result = removeNode(nodes, "A");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("B");
  });

  it("cleans up dependsOn references", () => {
    const nodes = [makeNode("A"), makeNode("B", ["A"]), makeNode("C", ["A", "B"])];
    const result = removeNode(nodes, "A");
    expect(result).toHaveLength(2);
    expect(result[0].dependsOn).toEqual([]); // B no longer depends on A
    expect(result[1].dependsOn).toEqual(["B"]); // C still depends on B
  });

  it("no-op for non-existent node", () => {
    const nodes = [makeNode("A")];
    const result = removeNode(nodes, "Z");
    expect(result).toHaveLength(1);
  });
});

describe("renameNode", () => {
  it("renames the target node", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const result = renameNode(nodes, "A", "New Label");
    expect(result[0].label).toBe("New Label");
    expect(result[1].label).toBe("Node B");
  });
});

describe("updateNodeStatement", () => {
  it("updates statement text", () => {
    const nodes = [makeNode("A")];
    const result = updateNodeStatement(nodes, "A", "Updated statement");
    expect(result[0].statement).toBe("Updated statement");
  });
});

describe("addEdge", () => {
  it("adds a dependency edge", () => {
    const nodes = [makeNode("A"), makeNode("B")];
    const result = addEdge(nodes, "A", "B");
    expect(result).not.toBeNull();
    expect(result!.find((n) => n.id === "B")!.dependsOn).toEqual(["A"]);
  });

  it("rejects duplicate edge", () => {
    const nodes = [makeNode("A"), makeNode("B", ["A"])];
    expect(addEdge(nodes, "A", "B")).toBeNull();
  });

  it("rejects cycle-creating edge", () => {
    const nodes = [makeNode("A"), makeNode("B", ["A"])];
    expect(addEdge(nodes, "B", "A")).toBeNull();
  });

  it("rejects edge with non-existent node", () => {
    const nodes = [makeNode("A")];
    expect(addEdge(nodes, "A", "Z")).toBeNull();
  });
});

describe("removeEdge", () => {
  it("removes the dependency", () => {
    const nodes = [makeNode("A"), makeNode("B", ["A"])];
    const result = removeEdge(nodes, "A", "B");
    expect(result.find((n) => n.id === "B")!.dependsOn).toEqual([]);
  });

  it("preserves other dependencies", () => {
    const nodes = [makeNode("A"), makeNode("B"), makeNode("C", ["A", "B"])];
    const result = removeEdge(nodes, "A", "C");
    expect(result.find((n) => n.id === "C")!.dependsOn).toEqual(["B"]);
  });
});
