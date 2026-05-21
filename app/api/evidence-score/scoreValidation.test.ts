import { describe, it, expect } from "vitest";
import {
  clampScore,
  normalizeStudyType,
  validatePaperScore,
} from "./scoreValidation";

describe("clampScore", () => {
  it("returns the number unchanged when within [0, 1]", () => {
    expect(clampScore(0.5)).toBe(0.5);
    expect(clampScore(0)).toBe(0);
    expect(clampScore(1)).toBe(1);
  });

  it("clamps values above 1 to 1", () => {
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(100)).toBe(1);
  });

  it("clamps negative values to 0", () => {
    expect(clampScore(-0.5)).toBe(0);
    expect(clampScore(-100)).toBe(0);
  });

  it("returns 0 for non-number input", () => {
    expect(clampScore("0.5")).toBe(0);
    expect(clampScore(null)).toBe(0);
    expect(clampScore(undefined)).toBe(0);
    expect(clampScore({})).toBe(0);
  });

  it("returns 0 for NaN and Infinity", () => {
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore(Infinity)).toBe(0);
    expect(clampScore(-Infinity)).toBe(0);
  });
});

describe("normalizeStudyType", () => {
  it("returns valid study types unchanged", () => {
    expect(normalizeStudyType("meta-analysis")).toBe("meta-analysis");
    expect(normalizeStudyType("rct")).toBe("rct");
    expect(normalizeStudyType("cohort")).toBe("cohort");
    expect(normalizeStudyType("case-control")).toBe("case-control");
    expect(normalizeStudyType("cross-sectional")).toBe("cross-sectional");
    expect(normalizeStudyType("case-study")).toBe("case-study");
    expect(normalizeStudyType("expert-opinion")).toBe("expert-opinion");
    expect(normalizeStudyType("systematic-review")).toBe("systematic-review");
    expect(normalizeStudyType("unknown")).toBe("unknown");
  });

  it("returns 'unknown' for invalid strings", () => {
    expect(normalizeStudyType("randomized-trial")).toBe("unknown");
    expect(normalizeStudyType("")).toBe("unknown");
    expect(normalizeStudyType("RCT")).toBe("unknown"); // case-sensitive
  });

  it("returns 'unknown' for non-string input", () => {
    expect(normalizeStudyType(42)).toBe("unknown");
    expect(normalizeStudyType(null)).toBe("unknown");
    expect(normalizeStudyType(undefined)).toBe("unknown");
  });
});

describe("validatePaperScore", () => {
  it("validates a well-formed score object", () => {
    const raw = {
      openAlexId: "W123",
      reliability: {
        score: 0.75,
        studyType: "rct",
        rationale: "Good study.",
        redFlags: ["small sample"],
      },
      relatedness: {
        score: 0.8,
        rationale: "Directly relevant.",
      },
    };
    const result = validatePaperScore(raw);
    expect(result).not.toBeNull();
    expect(result!.openAlexId).toBe("W123");
    expect(result!.reliability.score).toBe(0.75);
    expect(result!.reliability.studyType).toBe("rct");
    expect(result!.reliability.rationale).toBe("Good study.");
    expect(result!.reliability.redFlags).toEqual(["small sample"]);
    expect(result!.relatedness.score).toBe(0.8);
    expect(result!.relatedness.rationale).toBe("Directly relevant.");
  });

  it("returns null when openAlexId is missing", () => {
    expect(validatePaperScore({})).toBeNull();
    expect(validatePaperScore({ openAlexId: "" })).toBeNull();
    expect(validatePaperScore({ openAlexId: 42 })).toBeNull();
  });

  it("handles missing reliability and relatedness gracefully", () => {
    const result = validatePaperScore({ openAlexId: "W456" });
    expect(result).not.toBeNull();
    expect(result!.reliability.score).toBe(0);
    expect(result!.reliability.studyType).toBe("unknown");
    expect(result!.reliability.rationale).toBe("");
    expect(result!.reliability.redFlags).toEqual([]);
    expect(result!.relatedness.score).toBe(0);
    expect(result!.relatedness.rationale).toBe("");
  });

  it("clamps out-of-range scores", () => {
    const raw = {
      openAlexId: "W789",
      reliability: { score: 1.5, studyType: "rct", rationale: "x", redFlags: [] },
      relatedness: { score: -0.2, rationale: "y" },
    };
    const result = validatePaperScore(raw);
    expect(result!.reliability.score).toBe(1);
    expect(result!.relatedness.score).toBe(0);
  });

  it("filters non-string red flags", () => {
    const raw = {
      openAlexId: "W101",
      reliability: {
        score: 0.5,
        studyType: "cohort",
        rationale: "ok",
        redFlags: ["valid flag", 42, null, "another flag"],
      },
      relatedness: { score: 0.5, rationale: "ok" },
    };
    const result = validatePaperScore(raw);
    expect(result!.reliability.redFlags).toEqual(["valid flag", "another flag"]);
  });

  it("normalizes invalid study types to 'unknown'", () => {
    const raw = {
      openAlexId: "W202",
      reliability: { score: 0.5, studyType: "invalid-type", rationale: "x", redFlags: [] },
      relatedness: { score: 0.5, rationale: "y" },
    };
    const result = validatePaperScore(raw);
    expect(result!.reliability.studyType).toBe("unknown");
  });
});
