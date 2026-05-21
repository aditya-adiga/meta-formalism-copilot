import { describe, it, expect } from "vitest";
import { sanitizeQueries, MAX_OVERRIDE_QUERIES, MAX_QUERY_LENGTH } from "./querySanitize";

describe("sanitizeQueries", () => {
  it("returns [] for non-array input", () => {
    expect(sanitizeQueries(undefined)).toEqual([]);
    expect(sanitizeQueries(null)).toEqual([]);
    expect(sanitizeQueries("nudge defaults")).toEqual([]);
    expect(sanitizeQueries({ 0: "x" })).toEqual([]);
  });

  it("trims, drops empties, and coerces to strings", () => {
    expect(sanitizeQueries(["  retirement savings  ", "", "   ", "nudge"])).toEqual([
      "retirement savings",
      "nudge",
    ]);
  });

  it("caps each query length", () => {
    const long = "a".repeat(MAX_QUERY_LENGTH + 50);
    expect(sanitizeQueries([long])[0]).toHaveLength(MAX_QUERY_LENGTH);
  });

  it("caps the number of queries", () => {
    const many = Array.from({ length: MAX_OVERRIDE_QUERIES + 3 }, (_, i) => `q${i}`);
    expect(sanitizeQueries(many)).toHaveLength(MAX_OVERRIDE_QUERIES);
  });

  it("ignores non-string array entries", () => {
    expect(sanitizeQueries([1, "ok", { a: 1 }, true])).toEqual(["ok"]);
  });
});
