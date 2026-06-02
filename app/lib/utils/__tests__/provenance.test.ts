import { describe, it, expect } from "vitest";
import { fnv1aHash, buildInputHash, buildProvenance } from "../provenance";

describe("fnv1aHash", () => {
  it("returns deterministic 8-char hex strings", () => {
    const h1 = fnv1aHash("hello world");
    const h2 = fnv1aHash("hello world");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
  });

  it("produces different hashes for different inputs", () => {
    expect(fnv1aHash("abc")).not.toBe(fnv1aHash("abd"));
    expect(fnv1aHash("")).not.toBe(fnv1aHash(" "));
  });

  it("handles empty string", () => {
    const h = fnv1aHash("");
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("buildInputHash", () => {
  it("combines text and context deterministically", () => {
    const h1 = buildInputHash("source", "context");
    const h2 = buildInputHash("source", "context");
    expect(h1).toBe(h2);
  });

  it("distinguishes different text/context splits", () => {
    // ("ab", "cd") should differ from ("a", "bcd")
    const h1 = buildInputHash("ab", "cd");
    const h2 = buildInputHash("a", "bcd");
    expect(h1).not.toBe(h2);
  });

  it("distinguishes empty context from no context", () => {
    const h1 = buildInputHash("text", "");
    const h2 = buildInputHash("text", " ");
    expect(h1).not.toBe(h2);
  });
});

describe("buildProvenance", () => {
  it("returns correct shape", () => {
    const p = buildProvenance("text", "ctx");
    expect(p).toHaveProperty("inputHash");
    expect(p).toHaveProperty("generatedAt");
    expect(p.inputHash).toMatch(/^[0-9a-f]{8}$/);
    expect(() => new Date(p.generatedAt)).not.toThrow();
  });

  it("uses buildInputHash for the hash", () => {
    const p = buildProvenance("text", "ctx");
    expect(p.inputHash).toBe(buildInputHash("text", "ctx"));
  });
});
