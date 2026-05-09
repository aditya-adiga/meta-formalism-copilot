import { describe, it, expect } from "vitest";
import {
  reconstructAbstract,
  mapOpenAlexWork,
  deduplicatePapers,
  type OpenAlexWork,
} from "./openAlexUtils";
import type { EvidencePaper } from "@/app/lib/types/evidence";

describe("reconstructAbstract", () => {
  it("reconstructs a simple inverted index", () => {
    const index = {
      The: [0],
      quick: [1],
      brown: [2],
      fox: [3],
    };
    expect(reconstructAbstract(index)).toBe("The quick brown fox");
  });

  it("handles words appearing at multiple positions", () => {
    const index = {
      the: [0, 4],
      cat: [1],
      sat: [2],
      on: [3],
      mat: [5],
    };
    expect(reconstructAbstract(index)).toBe("the cat sat on the mat");
  });

  it("returns null for null input", () => {
    expect(reconstructAbstract(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(reconstructAbstract(undefined)).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(reconstructAbstract({})).toBeNull();
  });

  it("handles sparse positions gracefully", () => {
    const index = {
      hello: [0],
      world: [2],
    };
    // Position 1 is missing — filter(undefined) skips it
    expect(reconstructAbstract(index)).toBe("hello world");
  });
});

describe("mapOpenAlexWork", () => {
  it("maps a full work object", () => {
    const work: OpenAlexWork = {
      id: "https://openalex.org/W123",
      title: "Test Paper",
      authorships: [
        { author: { display_name: "Alice Smith" } },
        { author: { display_name: "Bob Jones" } },
      ],
      publication_year: 2023,
      cited_by_count: 42,
      abstract_inverted_index: { A: [0], test: [1] },
      primary_location: { source: { display_name: "Nature" } },
      open_access: { oa_url: "https://example.com/paper.pdf" },
      doi: "https://doi.org/10.1234/test",
    };

    const paper = mapOpenAlexWork(work);
    expect(paper.openAlexId).toBe("https://openalex.org/W123");
    expect(paper.title).toBe("Test Paper");
    expect(paper.authors).toEqual(["Alice Smith", "Bob Jones"]);
    expect(paper.year).toBe(2023);
    expect(paper.abstract).toBe("A test");
    expect(paper.citedByCount).toBe(42);
    expect(paper.journal).toBe("Nature");
    expect(paper.oaUrl).toBe("https://example.com/paper.pdf");
    expect(paper.doi).toBe("https://doi.org/10.1234/test");
  });

  it("handles minimal work object with missing fields", () => {
    const work: OpenAlexWork = {};
    const paper = mapOpenAlexWork(work);
    expect(paper.openAlexId).toBe("");
    expect(paper.title).toBe("(untitled)");
    expect(paper.authors).toEqual([]);
    expect(paper.year).toBeNull();
    expect(paper.abstract).toBeNull();
    expect(paper.citedByCount).toBe(0);
    expect(paper.journal).toBeNull();
    expect(paper.oaUrl).toBeNull();
    expect(paper.doi).toBeNull();
  });

  it("filters out authorships with missing display_name", () => {
    const work: OpenAlexWork = {
      authorships: [
        { author: { display_name: "Alice" } },
        { author: {} },
        { author: { display_name: "" } },
        { author: { display_name: "Bob" } },
      ],
    };
    const paper = mapOpenAlexWork(work);
    expect(paper.authors).toEqual(["Alice", "Bob"]);
  });
});

describe("deduplicatePapers", () => {
  const makePaper = (id: string, title: string): EvidencePaper => ({
    openAlexId: id,
    title,
    authors: [],
    year: null,
    abstract: null,
    citedByCount: 0,
    journal: null,
    doi: null,
    oaUrl: null,
  });

  it("removes duplicates by openAlexId", () => {
    const papers = [
      makePaper("W1", "Paper A"),
      makePaper("W2", "Paper B"),
      makePaper("W1", "Paper A duplicate"),
    ];
    const result = deduplicatePapers(papers);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Paper A");
    expect(result[1].title).toBe("Paper B");
  });

  it("filters out papers with empty openAlexId", () => {
    const papers = [
      makePaper("", "No ID"),
      makePaper("W1", "Has ID"),
    ];
    const result = deduplicatePapers(papers);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Has ID");
  });

  it("returns empty array for empty input", () => {
    expect(deduplicatePapers([])).toEqual([]);
  });
});
