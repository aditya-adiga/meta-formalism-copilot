import { describe, it, expect, vi } from "vitest";

// Mock pdfjs-dist since it requires browser APIs (DOMMatrix) unavailable in jsdom.
// The dynamic import in fileExtraction.ts will resolve to this mock.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

import { sanitizeText } from "./fileExtraction";

describe("sanitizeText", () => {
  it("normalizes NFKC ligatures", () => {
    expect(sanitizeText("ﬁnd the ﬂow")).toBe("find the flow");
  });

  it("strips control characters but keeps newlines and tabs", () => {
    const input = "hello\x01\x02world\nfoo\tbar\x7F";
    expect(sanitizeText(input)).toBe("helloworld\nfoo\tbar");
  });

  it("strips null bytes and other low control chars", () => {
    expect(sanitizeText("\x00\x01\x02\x03")).toBe("");
  });

  it("preserves newlines and tabs", () => {
    expect(sanitizeText("line1\nline2\tcol")).toBe("line1\nline2\tcol");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitizeText("")).toBe("");
  });

  it("handles normal text unchanged", () => {
    const text = "This is a normal theorem about groups.";
    expect(sanitizeText(text)).toBe(text);
  });

  it("normalizes superscript digits", () => {
    expect(sanitizeText("x²")).toBe("x2");
  });
});
