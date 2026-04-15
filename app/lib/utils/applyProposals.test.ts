import { describe, it, expect } from "vitest";
import { resolveFieldPath, getFieldValue, applyProposals } from "./applyProposals";
import type { IntegrationProposal } from "@/app/lib/types/evidence";

function makeProposal(overrides: Partial<IntegrationProposal> = {}): IntegrationProposal {
  return {
    id: "p1",
    fieldPath: "summary",
    fieldLabel: "Summary",
    currentValue: "old",
    proposedValue: "new",
    rationale: "test",
    paperIds: ["W1"],
    decision: true,
    editType: "refine-wording",
    ...overrides,
  };
}

describe("resolveFieldPath", () => {
  it("resolves a top-level key", () => {
    const obj = { summary: "hello" };
    const result = resolveFieldPath(obj, "summary");
    expect(result).toEqual({ parent: obj, key: "summary" });
  });

  it("resolves an array index", () => {
    const obj = { items: ["a", "b", "c"] };
    const result = resolveFieldPath(obj, "items[1]");
    expect(result).toEqual({ parent: obj.items, key: 1 });
  });

  it("resolves a nested path with array index", () => {
    const obj = { hypotheses: [{ id: "H1", statement: "foo" }] };
    const result = resolveFieldPath(obj, "hypotheses[0].statement");
    expect(result).toEqual({ parent: obj.hypotheses[0], key: "statement" });
  });

  it("returns null for non-existent top-level key", () => {
    expect(resolveFieldPath({ a: 1 }, "b")).toBeNull();
  });

  it("returns null for out-of-bounds array index", () => {
    expect(resolveFieldPath({ items: [1] }, "items[5]")).toBeNull();
  });

  it("returns null for path through a primitive", () => {
    expect(resolveFieldPath({ a: 42 }, "a.b")).toBeNull();
  });

  it("returns null for empty path", () => {
    expect(resolveFieldPath({ a: 1 }, "")).toBeNull();
  });
});

describe("getFieldValue", () => {
  it("reads a top-level value", () => {
    expect(getFieldValue({ summary: "hello" }, "summary")).toBe("hello");
  });

  it("reads a nested array value", () => {
    const obj = { hypotheses: [{ statement: "claim" }] };
    expect(getFieldValue(obj, "hypotheses[0].statement")).toBe("claim");
  });

  it("returns undefined for missing path", () => {
    expect(getFieldValue({ a: 1 }, "b")).toBeUndefined();
  });
});

describe("applyProposals", () => {
  it("applies an approved string field edit", () => {
    const artifact = JSON.stringify({ summary: "old summary", claim: "x" });
    const result = applyProposals(artifact, [
      makeProposal({ fieldPath: "summary", proposedValue: "new summary", decision: true }),
    ]);
    expect(JSON.parse(result)).toEqual({ summary: "new summary", claim: "x" });
  });

  it("applies an approved nested field edit", () => {
    const artifact = JSON.stringify({
      hypotheses: [{ id: "H1", statement: "old" }],
    });
    const result = applyProposals(artifact, [
      makeProposal({
        fieldPath: "hypotheses[0].statement",
        proposedValue: "new statement",
        decision: true,
      }),
    ]);
    expect(JSON.parse(result).hypotheses[0].statement).toBe("new statement");
  });

  it("skips rejected proposals", () => {
    const artifact = JSON.stringify({ summary: "keep me" });
    const result = applyProposals(artifact, [
      makeProposal({ fieldPath: "summary", proposedValue: "nope", decision: false }),
    ]);
    expect(JSON.parse(result).summary).toBe("keep me");
  });

  it("skips pending proposals", () => {
    const artifact = JSON.stringify({ summary: "keep me" });
    const result = applyProposals(artifact, [
      makeProposal({ fieldPath: "summary", proposedValue: "nope", decision: null }),
    ]);
    expect(JSON.parse(result).summary).toBe("keep me");
  });

  it("skips proposals with invalid fieldPaths", () => {
    const artifact = JSON.stringify({ summary: "keep me" });
    const result = applyProposals(artifact, [
      makeProposal({ fieldPath: "nonexistent.field", proposedValue: "nope", decision: true }),
    ]);
    expect(JSON.parse(result).summary).toBe("keep me");
  });

  it("applies multiple approved proposals", () => {
    const artifact = JSON.stringify({
      summary: "old",
      assumptions: ["A1", "A2"],
    });
    const result = applyProposals(artifact, [
      makeProposal({ id: "p1", fieldPath: "summary", proposedValue: "new", decision: true }),
      makeProposal({ id: "p2", fieldPath: "assumptions[0]", proposedValue: "updated A1", decision: true }),
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.summary).toBe("new");
    expect(parsed.assumptions[0]).toBe("updated A1");
  });

  it("returns original JSON when no proposals are approved", () => {
    const artifact = JSON.stringify({ summary: "keep" });
    const result = applyProposals(artifact, []);
    expect(result).toBe(artifact);
  });

  it("parses JSON-valued proposedValue for object fields", () => {
    const artifact = JSON.stringify({
      hypotheses: [{ id: "H1", statement: "old", nullHypothesis: "none" }],
    });
    // Replace entire hypothesis object
    const newHypothesis = JSON.stringify({ id: "H1", statement: "new", nullHypothesis: "updated" });
    const result = applyProposals(artifact, [
      makeProposal({
        fieldPath: "hypotheses[0]",
        proposedValue: newHypothesis,
        decision: true,
      }),
    ]);
    expect(JSON.parse(result).hypotheses[0]).toEqual({
      id: "H1",
      statement: "new",
      nullHypothesis: "updated",
    });
  });
});
