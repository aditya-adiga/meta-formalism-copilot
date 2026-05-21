import { describe, it, expect } from "vitest";
import { validateProposal } from "./integrateValidation";

const ARTIFACT = {
  summary: "A study of X",
  hypotheses: [
    { id: "H1", statement: "X causes Y", nullHypothesis: "no effect", testSuggestion: "t-test" },
  ],
  assumptions: ["normality", "independence"],
};

const VALID_IDS = new Set(["W1", "W2", "W3"]);

function rawProposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fieldPath: "summary",
    fieldLabel: "Summary",
    currentValue: "A study of X",
    proposedValue: "A study of X and Y",
    rationale: "Paper W1 shows Y is also relevant",
    paperIds: ["W1"],
    editType: "refine-wording",
    ...overrides,
  };
}

describe("validateProposal", () => {
  it("returns a valid proposal unchanged", () => {
    const result = validateProposal(rawProposal(), ARTIFACT, VALID_IDS);
    expect(result).toEqual({
      fieldPath: "summary",
      fieldLabel: "Summary",
      currentValue: "A study of X",
      proposedValue: "A study of X and Y",
      rationale: "Paper W1 shows Y is also relevant",
      paperIds: ["W1"],
      editType: "refine-wording",
    });
  });

  it("returns null when fieldPath is missing", () => {
    expect(validateProposal(rawProposal({ fieldPath: "" }), ARTIFACT, VALID_IDS)).toBeNull();
  });

  it("returns null when fieldPath does not resolve", () => {
    expect(validateProposal(rawProposal({ fieldPath: "nonexistent" }), ARTIFACT, VALID_IDS)).toBeNull();
  });

  it("returns null when currentValue equals proposedValue", () => {
    expect(
      validateProposal(rawProposal({ proposedValue: "A study of X" }), ARTIFACT, VALID_IDS),
    ).toBeNull();
  });

  it("returns null when paperIds is empty", () => {
    expect(validateProposal(rawProposal({ paperIds: [] }), ARTIFACT, VALID_IDS)).toBeNull();
  });

  it("filters out invalid paperIds", () => {
    const result = validateProposal(
      rawProposal({ paperIds: ["W1", "INVALID", "W2"] }),
      ARTIFACT,
      VALID_IDS,
    );
    expect(result?.paperIds).toEqual(["W1", "W2"]);
  });

  it("returns null when all paperIds are invalid", () => {
    expect(
      validateProposal(rawProposal({ paperIds: ["INVALID"] }), ARTIFACT, VALID_IDS),
    ).toBeNull();
  });

  it("defaults to refine-wording for invalid editType", () => {
    const result = validateProposal(rawProposal({ editType: "unknown-type" }), ARTIFACT, VALID_IDS);
    expect(result?.editType).toBe("refine-wording");
  });

  it("accepts all valid edit types", () => {
    for (const editType of ["update-prior", "add-evidence", "flag-contradiction", "refine-wording"]) {
      const result = validateProposal(rawProposal({ editType }), ARTIFACT, VALID_IDS);
      expect(result?.editType).toBe(editType);
    }
  });

  it("validates nested fieldPaths", () => {
    const result = validateProposal(
      rawProposal({
        fieldPath: "hypotheses[0].statement",
        currentValue: "X causes Y",
        proposedValue: "X strongly causes Y (d=0.4)",
      }),
      ARTIFACT,
      VALID_IDS,
    );
    expect(result?.fieldPath).toBe("hypotheses[0].statement");
  });

  it("returns null for non-string required fields", () => {
    expect(validateProposal(rawProposal({ fieldLabel: 123 }), ARTIFACT, VALID_IDS)).toBeNull();
    expect(validateProposal(rawProposal({ rationale: null }), ARTIFACT, VALID_IDS)).toBeNull();
    expect(validateProposal(rawProposal({ proposedValue: undefined }), ARTIFACT, VALID_IDS)).toBeNull();
  });
});
