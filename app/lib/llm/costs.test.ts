import { describe, it, expect } from "vitest";
import {
  computeCost,
  formatEstimatedCost,
  formatRecordedCost,
  recomputeEntryCost,
  estimateCost,
} from "./costs";

describe("computeCost", () => {
  it("returns correct cost for a known model", () => {
    // claude-sonnet-4-6: input 3/1M, output 15/1M
    const cost = computeCost("claude-sonnet-4-6", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(3 + 15, 5);
  });

  it("returns 0 for an unknown model", () => {
    expect(computeCost("unknown-model", 1000, 500)).toBe(0);
  });

  it("returns 0 when tokens are zero", () => {
    expect(computeCost("claude-sonnet-4-6", 0, 0)).toBe(0);
  });
});

describe("formatEstimatedCost", () => {
  it("returns '<$0.01' for sub-cent values", () => {
    expect(formatEstimatedCost(0.004)).toBe("<$0.01");
    expect(formatEstimatedCost(0)).toBe("<$0.01");
  });

  it("rounds to 2 decimals at the threshold", () => {
    expect(formatEstimatedCost(0.005)).toBe("$0.01");
    expect(formatEstimatedCost(0.01)).toBe("$0.01");
  });

  it("formats larger values with 2 decimals", () => {
    expect(formatEstimatedCost(1.456)).toBe("$1.46");
  });
});

describe("formatRecordedCost", () => {
  it("returns '$0.00' for exactly zero", () => {
    expect(formatRecordedCost(0)).toBe("$0.00");
  });

  it("shows 4 decimals for sub-cent values", () => {
    expect(formatRecordedCost(0.0023)).toBe("$0.0023");
    expect(formatRecordedCost(0.0099)).toBe("$0.0099");
  });

  it("shows 2 decimals for values >= $0.01", () => {
    expect(formatRecordedCost(0.01)).toBe("$0.01");
    expect(formatRecordedCost(1.5)).toBe("$1.50");
  });
});

describe("recomputeEntryCost", () => {
  it("recomputes cost from model and tokens when model is known", () => {
    const entry = { model: "claude-sonnet-4-6", inputTokens: 1000, outputTokens: 500, costUsd: 0.99 };
    const expected = computeCost("claude-sonnet-4-6", 1000, 500);
    expect(recomputeEntryCost(entry)).toBeCloseTo(expected, 10);
  });

  it("falls back to stored costUsd when model is unknown", () => {
    const entry = { model: "unknown", inputTokens: 1000, outputTokens: 500, costUsd: 0.42 };
    expect(recomputeEntryCost(entry)).toBe(0.42);
  });

  it("falls back to stored costUsd when computed cost is zero (unknown model)", () => {
    const entry = { model: "not-in-table", inputTokens: 0, outputTokens: 0, costUsd: 0.05 };
    expect(recomputeEntryCost(entry)).toBe(0.05);
  });
});

describe("estimateCost", () => {
  it("uses default estimate when no artifact types provided", () => {
    const cost = estimateCost(4000); // ~1000 input tokens
    // Default: sonnet, 1750 output tokens
    const expected = computeCost("claude-sonnet-4-6", 1000, 1750);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("uses default estimate for empty array", () => {
    const cost = estimateCost(4000, []);
    const expected = computeCost("claude-sonnet-4-6", 1000, 1750);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("uses per-endpoint estimate for a known artifact type", () => {
    const cost = estimateCost(4000, ["lean"]);
    // lean: sonnet, 1450 output tokens
    const expected = computeCost("claude-sonnet-4-6", 1000, 1450);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("sums costs across multiple artifact types", () => {
    const cost = estimateCost(4000, ["semiformal", "lean"]);
    const inputTokens = 1000;
    const expected =
      computeCost("claude-sonnet-4-6", inputTokens, 1250) + // semiformal
      computeCost("claude-sonnet-4-6", inputTokens, 1450);  // lean
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("maps 'decomposition' to decomposition/extract endpoint", () => {
    const cost = estimateCost(4000, ["decomposition"]);
    const expected = computeCost("claude-sonnet-4-6", 1000, 2100);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("returns zero for zero-length input with cheap endpoint", () => {
    // 0 chars -> 0 input tokens; output-only cost
    const cost = estimateCost(0, ["lean"]);
    const expected = computeCost("claude-sonnet-4-6", 0, 1450);
    expect(cost).toBeCloseTo(expected, 10);
  });
});
