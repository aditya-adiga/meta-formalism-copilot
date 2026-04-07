import { describe, it, expect } from "vitest";
import { isCustomType } from "./customArtifact";

describe("isCustomType", () => {
  it("returns true for valid custom type IDs", () => {
    expect(isCustomType("custom-abc123")).toBe(true);
    expect(isCustomType("custom-123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isCustomType("custom-x")).toBe(true);
  });

  it("returns true for 'custom-' with empty suffix", () => {
    expect(isCustomType("custom-")).toBe(true);
  });

  it("returns false for built-in artifact types", () => {
    expect(isCustomType("semiformal")).toBe(false);
    expect(isCustomType("lean")).toBe(false);
    expect(isCustomType("causal-graph")).toBe(false);
    expect(isCustomType("statistical-model")).toBe(false);
    expect(isCustomType("property-tests")).toBe(false);
    expect(isCustomType("dialectical-map")).toBe(false);
    expect(isCustomType("counterexamples")).toBe(false);
  });

  it("returns false for edge cases", () => {
    expect(isCustomType("")).toBe(false);
    expect(isCustomType("custom")).toBe(false);
    expect(isCustomType("Custom-foo")).toBe(false);
    expect(isCustomType("CUSTOM-foo")).toBe(false);
    expect(isCustomType("customfoo")).toBe(false);
  });
});
