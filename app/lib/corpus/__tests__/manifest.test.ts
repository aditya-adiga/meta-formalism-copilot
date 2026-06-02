/** Manifest codec tests (DD-009 S0, test-strategy G11/G12). */

import { describe, it, expect } from "vitest";
import { createManifest, serializeManifest, parseManifest, MANIFEST_VERSION } from "../manifest";
import { CorpusError } from "../types";

describe("manifest round-trip (G12)", () => {
  it("serialize -> parse is lossless for sources, artifact pointers, custom-type ids", () => {
    const m = createManifest("My Workspace", "2026-06-01T00:00:00Z");
    m.sources = [{ id: "s1", label: "Paper A", ext: "pdf" }];
    m.artifacts = [
      { type: "semiformal", currentVersion: 3 },
      { type: "causal-graph", currentVersion: 1 },
    ];
    m.customTypeIds = ["custom-abc", "custom-def"];

    const parsed = parseManifest(serializeManifest(m));
    expect(parsed).toEqual(m);
    expect(parsed.manifestVersion).toBe(MANIFEST_VERSION);
  });
});

describe("manifest fail-loud parse (G11)", () => {
  it("throws CorpusError on non-JSON instead of returning an empty manifest", () => {
    const bytes = new TextEncoder().encode("{ not json");
    expect(() => parseManifest(bytes)).toThrow(CorpusError);
  });

  it("throws on a JSON object missing required fields (not a silent default)", () => {
    const bytes = new TextEncoder().encode("{}");
    let caught: unknown;
    try {
      parseManifest(bytes);
    } catch (e) {
      caught = e;
    }
    // Diagnostic: assert on the typed detail, not a string match.
    expect(caught).toBeInstanceOf(CorpusError);
    expect((caught as CorpusError).detail.kind).toBe("io");
  });

  it("throws on a null input (absent file is the caller's null-check, not a default)", () => {
    expect(() => parseManifest(null)).toThrow(CorpusError);
  });

  it("throws when sources entries are malformed", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ manifestVersion: 1, title: "t", sources: [{ id: "x" }], artifacts: [], customTypeIds: [] }),
    );
    expect(() => parseManifest(bytes)).toThrow(/source entry missing/);
  });
});
