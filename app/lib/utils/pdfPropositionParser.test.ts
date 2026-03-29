import { describe, it, expect } from "vitest";
import type { TextItem, TextStyle } from "pdfjs-dist/types/src/display/api";
import {
  reconstructLines,
  identifyPropositionHeaders,
  segmentDocument,
  extractDependencies,
  isPdfTexCompiled,
  isBoldFont,
  isItalicFont,
  type Line,
  type FontSpan,
  type RawSegment,
} from "./pdfPropositionParser";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a minimal TextItem for testing. */
function makeItem(
  str: string,
  fontName: string,
  x: number,
  y: number,
  hasEOL = false,
): TextItem {
  return {
    str,
    dir: "ltr",
    transform: [1, 0, 0, 1, x, y], // [scaleX, 0, 0, scaleY, translateX, translateY]
    width: str.length * 5,
    height: 12,
    fontName,
    hasEOL,
  };
}

/** Create a minimal styles record. */
function makeStyles(entries: Record<string, { fontFamily: string }>): Record<string, TextStyle> {
  const result: Record<string, TextStyle> = {};
  for (const [name, { fontFamily }] of Object.entries(entries)) {
    result[name] = { ascent: 0.8, descent: -0.2, vertical: false, fontFamily };
  }
  return result;
}

/** Create a Line for testing. */
function makeLine(text: string, spans: FontSpan[], page = 1, y = 0): Line {
  return { text, spans, page, y };
}

function boldSpan(text: string): FontSpan {
  return { text, fontFamily: "Times-Bold", isBold: true, isItalic: false };
}

function normalSpan(text: string): FontSpan {
  return { text, fontFamily: "Times-Roman", isBold: false, isItalic: false };
}

function italicSpan(text: string): FontSpan {
  return { text, fontFamily: "Times-Italic", isBold: false, isItalic: true };
}

// ── Font classification ────────────────────────────────────────────────────

describe("isBoldFont", () => {
  it("detects 'Bold' in fontFamily", () => {
    expect(isBoldFont("Times-Bold")).toBe(true);
    expect(isBoldFont("CMR10-Bold")).toBe(true);
  });

  it("detects Computer Modern bold patterns", () => {
    expect(isBoldFont("", "CMBX10")).toBe(true);
    expect(isBoldFont("", "CMB10")).toBe(true);
  });

  it("returns false for non-bold fonts", () => {
    expect(isBoldFont("Times-Roman")).toBe(false);
    expect(isBoldFont("CMR10")).toBe(false);
  });
});

describe("isItalicFont", () => {
  it("detects 'Italic' in fontFamily", () => {
    expect(isItalicFont("Times-Italic")).toBe(true);
  });

  it("detects Computer Modern italic patterns", () => {
    expect(isItalicFont("", "CMTI10")).toBe(true);
    expect(isItalicFont("", "CMMI10")).toBe(true);
  });

  it("returns false for non-italic fonts", () => {
    expect(isItalicFont("Times-Roman")).toBe(false);
    expect(isItalicFont("CMR10")).toBe(false);
  });
});

// ── Line reconstruction ────────────────────────────────────────────────────

describe("reconstructLines", () => {
  it("groups items on the same Y-coordinate into one line", () => {
    const items = [
      makeItem("Hello ", "f1", 10, 700),
      makeItem("world", "f1", 60, 700),
    ];
    const styles = makeStyles({ f1: { fontFamily: "Times-Roman" } });

    const lines = reconstructLines(items, styles, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hello world");
    expect(lines[0].page).toBe(1);
  });

  it("splits items on different Y-coordinates into separate lines", () => {
    const items = [
      makeItem("Line 1", "f1", 10, 700),
      makeItem("Line 2", "f1", 10, 680),
    ];
    const styles = makeStyles({ f1: { fontFamily: "Times-Roman" } });

    const lines = reconstructLines(items, styles, 1);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Line 1");
    expect(lines[1].text).toBe("Line 2");
  });

  it("groups items within Y_TOLERANCE into one line", () => {
    const items = [
      makeItem("Same", "f1", 10, 700),
      makeItem("line", "f1", 50, 701.5), // Within 2px tolerance
    ];
    const styles = makeStyles({ f1: { fontFamily: "Times-Roman" } });

    const lines = reconstructLines(items, styles, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Sameline");
  });

  it("classifies bold and italic spans from font metadata", () => {
    const items = [
      makeItem("Theorem 1.", "boldFont", 10, 700),
      makeItem(" Let x be...", "normalFont", 90, 700),
    ];
    const styles = makeStyles({
      boldFont: { fontFamily: "Times-Bold" },
      normalFont: { fontFamily: "Times-Roman" },
    });

    const lines = reconstructLines(items, styles, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0].spans).toHaveLength(2);
    expect(lines[0].spans[0].isBold).toBe(true);
    expect(lines[0].spans[1].isBold).toBe(false);
  });

  it("returns empty array for empty input", () => {
    const lines = reconstructLines([], {}, 1);
    expect(lines).toHaveLength(0);
  });

  it("merges consecutive items with same font style", () => {
    const items = [
      makeItem("Hello ", "f1", 10, 700),
      makeItem("world ", "f1", 50, 700),
      makeItem("!", "f1", 90, 700),
    ];
    const styles = makeStyles({ f1: { fontFamily: "Times-Roman" } });

    const lines = reconstructLines(items, styles, 1);
    expect(lines[0].spans).toHaveLength(1);
    expect(lines[0].spans[0].text).toBe("Hello world !");
  });
});

// ── Header identification ──────────────────────────────────────────────────

describe("identifyPropositionHeaders", () => {
  it("identifies a bold theorem header", () => {
    const lines = [
      makeLine("Theorem 1. Every compact...", [
        boldSpan("Theorem 1."),
        normalSpan(" Every compact..."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].kind).toBe("theorem");
    expect(headers[0].number).toBe("1");
    expect(headers[0].boldConfirmed).toBe(true);
  });

  it("identifies multi-level numbering", () => {
    const lines = [
      makeLine("Lemma 2.3. Let f be...", [
        boldSpan("Lemma 2.3."),
        normalSpan(" Let f be..."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].kind).toBe("lemma");
    expect(headers[0].number).toBe("2.3");
  });

  it("identifies abbreviated forms", () => {
    const lines = [
      makeLine("Def. 4. A ring is...", [
        boldSpan("Def. 4."),
        normalSpan(" A ring is..."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].kind).toBe("definition");
  });

  it("identifies headers with parenthesized titles", () => {
    const lines = [
      makeLine("Theorem 1. (Cauchy-Schwarz) For all vectors...", [
        boldSpan("Theorem 1."),
        normalSpan(" (Cauchy-Schwarz) For all vectors..."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].title).toBe("Cauchy-Schwarz");
  });

  it("marks non-bold headers as unconfirmed", () => {
    const lines = [
      makeLine("Theorem 1. mentioned in passing...", [
        normalSpan("Theorem 1. mentioned in passing..."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].boldConfirmed).toBe(false);
  });

  it("identifies multiple headers across lines", () => {
    const lines = [
      makeLine("Definition 1. A group is...", [boldSpan("Definition 1."), normalSpan(" A group is...")]),
      makeLine("Some body text here.", [normalSpan("Some body text here.")]),
      makeLine("Theorem 2. Every group has...", [boldSpan("Theorem 2."), normalSpan(" Every group has...")]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(2);
    expect(headers[0].kind).toBe("definition");
    expect(headers[1].kind).toBe("theorem");
  });

  it("identifies three-level numbering like 1.2.1", () => {
    const lines = [
      makeLine("Definition 1.2.1 Denote by H the complex upper half plane.", [
        boldSpan("Definition 1.2.1"),
        normalSpan(" Denote by H the complex upper half plane."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].kind).toBe("definition");
    expect(headers[0].number).toBe("1.2.1");
  });

  it("identifies headers with space (no period) after number", () => {
    const lines = [
      makeLine("Theorem 1.2.6 Any holomorphic function f on H...", [
        boldSpan("Theorem 1.2.6"),
        normalSpan(" Any holomorphic function f on H..."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].kind).toBe("theorem");
    expect(headers[0].number).toBe("1.2.6");
  });

  it("identifies headers with colon separator", () => {
    const lines = [
      makeLine("Proposition 5: Let M be a manifold.", [
        boldSpan("Proposition 5:"),
        normalSpan(" Let M be a manifold."),
      ]),
    ];

    const headers = identifyPropositionHeaders(lines);
    expect(headers).toHaveLength(1);
    expect(headers[0].kind).toBe("proposition");
    expect(headers[0].number).toBe("5");
  });
});

// ── Document segmentation ──────────────────────────────────────────────────

describe("segmentDocument", () => {
  it("segments body text between headers", () => {
    const lines = [
      makeLine("Theorem 1. Let X be a space.", [boldSpan("Theorem 1."), normalSpan(" Let X be a space.")]),
      makeLine("Then X is compact.", [normalSpan("Then X is compact.")]),
      makeLine("Lemma 2. Suppose f is continuous.", [boldSpan("Lemma 2."), normalSpan(" Suppose f is continuous.")]),
      makeLine("Then f is bounded.", [normalSpan("Then f is bounded.")]),
    ];

    const headers = identifyPropositionHeaders(lines);
    const segments = segmentDocument(lines, headers);

    expect(segments).toHaveLength(2);
    expect(segments[0].kind).toBe("theorem");
    expect(segments[0].body).toContain("Let X be a space");
    expect(segments[0].body).toContain("Then X is compact");
    expect(segments[1].kind).toBe("lemma");
    expect(segments[1].body).toContain("Suppose f is continuous");
  });

  it("extracts proof blocks", () => {
    const lines = [
      makeLine("Theorem 1. The sky is blue.", [boldSpan("Theorem 1."), normalSpan(" The sky is blue.")]),
      makeLine("Proof. By observation.", [italicSpan("Proof."), normalSpan(" By observation.")]),
      makeLine("We look up. □", [normalSpan("We look up. □")]),
      makeLine("Theorem 2. Water is wet.", [boldSpan("Theorem 2."), normalSpan(" Water is wet.")]),
    ];

    const headers = identifyPropositionHeaders(lines);
    const segments = segmentDocument(lines, headers);

    expect(segments).toHaveLength(2);
    expect(segments[0].proofText).toContain("By observation");
    expect(segments[0].proofText).toContain("We look up");
    expect(segments[0].body).not.toContain("Proof");
  });

  it("returns empty array when no headers", () => {
    const lines = [
      makeLine("Just some text.", [normalSpan("Just some text.")]),
    ];

    const segments = segmentDocument(lines, []);
    expect(segments).toHaveLength(0);
  });

  it("handles segment with no body after header", () => {
    const lines = [
      makeLine("Definition 1. A widget.", [boldSpan("Definition 1."), normalSpan(" A widget.")]),
      makeLine("Lemma 2. Widgets exist.", [boldSpan("Lemma 2."), normalSpan(" Widgets exist.")]),
    ];

    const headers = identifyPropositionHeaders(lines);
    const segments = segmentDocument(lines, headers);

    expect(segments).toHaveLength(2);
    // First segment has inline body from the header line
    expect(segments[0].body).toBe("A widget.");
    expect(segments[1].body).toBe("Widgets exist.");
  });
});

// ── Dependency extraction ──────────────────────────────────────────────────

describe("extractDependencies", () => {
  it("extracts references from body text", () => {
    const segments: RawSegment[] = [
      { kind: "definition", number: "1", title: "", body: "A group is a set G...", proofText: "", headerLineIndex: 0 },
      { kind: "theorem", number: "2", title: "", body: "By Definition 1, every group...", proofText: "", headerLineIndex: 3 },
    ];

    const deps = extractDependencies(segments);
    const thmDeps = deps.get(1) ?? [];
    expect(thmDeps).toContain("def-1");
  });

  it("extracts references from proof text", () => {
    const segments: RawSegment[] = [
      { kind: "lemma", number: "1", title: "", body: "If f is continuous...", proofText: "", headerLineIndex: 0 },
      { kind: "theorem", number: "2", title: "", body: "Every continuous map...", proofText: "By Lemma 1, f is bounded.", headerLineIndex: 3 },
    ];

    const deps = extractDependencies(segments);
    const thmDeps = deps.get(1) ?? [];
    expect(thmDeps).toContain("lem-1");
  });

  it("handles abbreviated references", () => {
    const segments: RawSegment[] = [
      { kind: "theorem", number: "1", title: "", body: "Statement A.", proofText: "", headerLineIndex: 0 },
      { kind: "corollary", number: "2", title: "", body: "From Thm. 1, we conclude...", proofText: "", headerLineIndex: 3 },
    ];

    const deps = extractDependencies(segments);
    const corDeps = deps.get(1) ?? [];
    expect(corDeps).toContain("thm-1");
  });

  it("does not add self-references", () => {
    const segments: RawSegment[] = [
      { kind: "theorem", number: "1", title: "", body: "By Theorem 1 we mean this theorem itself.", proofText: "", headerLineIndex: 0 },
    ];

    const deps = extractDependencies(segments);
    const selfDeps = deps.get(0) ?? [];
    expect(selfDeps).not.toContain("thm-1");
  });

  it("returns empty deps when no references found", () => {
    const segments: RawSegment[] = [
      { kind: "definition", number: "1", title: "", body: "A group is a set.", proofText: "", headerLineIndex: 0 },
    ];

    const deps = extractDependencies(segments);
    expect(deps.get(0) ?? []).toHaveLength(0);
  });

  it("handles multi-level numbering references", () => {
    const segments: RawSegment[] = [
      { kind: "lemma", number: "2.1", title: "", body: "If x > 0...", proofText: "", headerLineIndex: 0 },
      { kind: "theorem", number: "2.2", title: "", body: "Using Lemma 2.1, we have...", proofText: "", headerLineIndex: 3 },
    ];

    const deps = extractDependencies(segments);
    const thmDeps = deps.get(1) ?? [];
    expect(thmDeps).toContain("lem-1");
  });
});

// ── Detection heuristic ────────────────────────────────────────────────────

describe("isPdfTexCompiled", () => {
  it("returns true for ≥2 bold-confirmed headers", () => {
    const lines = [
      makeLine("Theorem 1. Statement A.", [boldSpan("Theorem 1."), normalSpan(" Statement A.")]),
      makeLine("Body text...", [normalSpan("Body text...")]),
      makeLine("Lemma 2. Statement B.", [boldSpan("Lemma 2."), normalSpan(" Statement B.")]),
    ];

    expect(isPdfTexCompiled(lines)).toBe(true);
  });

  it("returns false for <2 bold-confirmed and <3 total headers", () => {
    const lines = [
      makeLine("Theorem 1. Statement A.", [boldSpan("Theorem 1."), normalSpan(" Statement A.")]),
      makeLine("Some other text.", [normalSpan("Some other text.")]),
    ];

    expect(isPdfTexCompiled(lines)).toBe(false);
  });

  it("returns false for only 2 non-bold headers", () => {
    const lines = [
      makeLine("Theorem 1. is mentioned.", [normalSpan("Theorem 1. is mentioned.")]),
      makeLine("Lemma 2. is also mentioned.", [normalSpan("Lemma 2. is also mentioned.")]),
    ];

    expect(isPdfTexCompiled(lines)).toBe(false);
  });

  it("returns true for ≥3 non-bold headers (opaque font fallback)", () => {
    const lines = [
      makeLine("Definition 1. A group is...", [normalSpan("Definition 1. A group is...")]),
      makeLine("Theorem 2. Every group...", [normalSpan("Theorem 2. Every group...")]),
      makeLine("Corollary 3. Hence...", [normalSpan("Corollary 3. Hence...")]),
    ];

    expect(isPdfTexCompiled(lines)).toBe(true);
  });

  it("returns false for empty input", () => {
    expect(isPdfTexCompiled([])).toBe(false);
  });
});
