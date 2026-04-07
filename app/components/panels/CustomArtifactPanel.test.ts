import { describe, it, expect } from "vitest";
import { formatLabel } from "./CustomArtifactPanel";

describe("formatLabel", () => {
  it("converts camelCase to Title Case", () => {
    expect(formatLabel("camelCase")).toBe("Camel Case");
    expect(formatLabel("robustnessAssessment")).toBe("Robustness Assessment");
  });

  it("converts snake_case to Title Case", () => {
    expect(formatLabel("snake_case")).toBe("Snake Case");
    expect(formatLabel("target_assumption")).toBe("Target Assumption");
  });

  it("converts kebab-case to Title Case", () => {
    expect(formatLabel("kebab-case")).toBe("Kebab Case");
    expect(formatLabel("null-hypothesis")).toBe("Null Hypothesis");
  });

  it("capitalizes single words", () => {
    expect(formatLabel("summary")).toBe("Summary");
    expect(formatLabel("claim")).toBe("Claim");
  });

  it("handles empty string", () => {
    expect(formatLabel("")).toBe("");
  });

  it("handles already capitalized input", () => {
    expect(formatLabel("AlreadyCapitalized")).toBe("Already Capitalized");
  });
});
