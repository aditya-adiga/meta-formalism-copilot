import { describe, it, expect } from "vitest";
import {
  partitionPapers,
  buildRelationsFromRefs,
  findUnmatchedPairs,
  derivePaperStatus,
} from "./overlapUtils";
import type { EvidenceOverlapRequest } from "@/app/lib/types/evidence";

type OverlapPaper = EvidenceOverlapRequest["papers"][number];

/** Helper to create a minimal paper for testing */
function makePaper(
  id: string,
  opts: {
    studyType?: string;
    year?: number | null;
    abstract?: string | null;
  } = {},
): OverlapPaper {
  return {
    openAlexId: id,
    title: `Paper ${id}`,
    year: opts.year === undefined ? 2020 : opts.year,
    abstract: opts.abstract === undefined ? "An abstract" : opts.abstract,
    reliability: opts.studyType
      ? {
          score: 0.5,
          studyType: opts.studyType as OverlapPaper["reliability"] extends { studyType: infer T } ? T : never,
          rationale: "",
          redFlags: [],
        }
      : null,
  };
}

describe("partitionPapers", () => {
  it("separates reviews from individual studies", () => {
    const papers = [
      makePaper("W1", { studyType: "meta-analysis" }),
      makePaper("W2", { studyType: "rct" }),
      makePaper("W3", { studyType: "systematic-review" }),
      makePaper("W4", { studyType: "cohort" }),
    ];
    const { reviews, studies } = partitionPapers(papers);
    expect(reviews.map((r) => r.openAlexId)).toEqual(["W1", "W3"]);
    expect(studies.map((s) => s.openAlexId)).toEqual(["W2", "W4"]);
  });

  it("treats papers without reliability scores as studies", () => {
    const papers = [makePaper("W1"), makePaper("W2", { studyType: "rct" })];
    const { reviews, studies } = partitionPapers(papers);
    expect(reviews).toHaveLength(0);
    expect(studies).toHaveLength(2);
  });

  it("handles empty input", () => {
    const { reviews, studies } = partitionPapers([]);
    expect(reviews).toEqual([]);
    expect(studies).toEqual([]);
  });
});

describe("buildRelationsFromRefs", () => {
  it("finds studies referenced by a review", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis" })];
    const studies = [makePaper("S1"), makePaper("S2"), makePaper("S3")];
    const refsMap = new Map([["R1", ["S1", "S3", "OTHER"]]]);

    const relations = buildRelationsFromRefs(reviews, studies, refsMap);
    expect(relations).toHaveLength(2);
    expect(relations[0]).toEqual({
      reviewId: "R1",
      studyId: "S1",
      detectionMethod: "citation-graph",
      confidence: 1.0,
    });
    expect(relations[1].studyId).toBe("S3");
  });

  it("returns empty when review has no matching references", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis" })];
    const studies = [makePaper("S1")];
    const refsMap = new Map([["R1", ["UNRELATED1", "UNRELATED2"]]]);

    const relations = buildRelationsFromRefs(reviews, studies, refsMap);
    expect(relations).toEqual([]);
  });

  it("returns empty when refsMap is empty", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis" })];
    const studies = [makePaper("S1")];
    const relations = buildRelationsFromRefs(reviews, studies, new Map());
    expect(relations).toEqual([]);
  });

  it("handles multiple reviews referencing the same study", () => {
    const reviews = [
      makePaper("R1", { studyType: "meta-analysis" }),
      makePaper("R2", { studyType: "systematic-review" }),
    ];
    const studies = [makePaper("S1")];
    const refsMap = new Map([
      ["R1", ["S1"]],
      ["R2", ["S1"]],
    ]);

    const relations = buildRelationsFromRefs(reviews, studies, refsMap);
    expect(relations).toHaveLength(2);
    expect(relations[0].reviewId).toBe("R1");
    expect(relations[1].reviewId).toBe("R2");
  });
});

describe("findUnmatchedPairs", () => {
  it("excludes already-matched pairs", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis", year: 2022 })];
    const studies = [makePaper("S1", { year: 2020 }), makePaper("S2", { year: 2020 })];
    const matched = [
      { reviewId: "R1", studyId: "S1", detectionMethod: "citation-graph" as const, confidence: 1.0 },
    ];

    const pairs = findUnmatchedPairs(reviews, studies, matched);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].study.openAlexId).toBe("S2");
  });

  it("excludes studies published after the review", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis", year: 2020 })];
    const studies = [
      makePaper("S1", { year: 2019 }), // before review — included
      makePaper("S2", { year: 2020 }), // same year — included
      makePaper("S3", { year: 2021 }), // after review — excluded
    ];

    const pairs = findUnmatchedPairs(reviews, studies, []);
    expect(pairs.map((p) => p.study.openAlexId)).toEqual(["S1", "S2"]);
  });

  it("excludes pairs where study has no abstract", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis", year: 2022 })];
    const studies = [makePaper("S1", { year: 2020, abstract: null })];

    const pairs = findUnmatchedPairs(reviews, studies, []);
    expect(pairs).toEqual([]);
  });

  it("excludes pairs where review has no abstract", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis", year: 2022, abstract: null })];
    const studies = [makePaper("S1", { year: 2020 })];

    const pairs = findUnmatchedPairs(reviews, studies, []);
    expect(pairs).toEqual([]);
  });

  it("includes pairs when years are null (unknown)", () => {
    const reviews = [makePaper("R1", { studyType: "meta-analysis", year: null })];
    const studies = [makePaper("S1", { year: null })];

    const pairs = findUnmatchedPairs(reviews, studies, []);
    expect(pairs).toHaveLength(1);
  });
});

describe("derivePaperStatus", () => {
  it("assigns correct statuses with reviews and relations", () => {
    const papers = [
      makePaper("R1", { studyType: "meta-analysis" }),
      makePaper("S1", { studyType: "rct" }),
      makePaper("S2", { studyType: "cohort" }),
    ];
    const relations = [
      { reviewId: "R1", studyId: "S1", detectionMethod: "citation-graph" as const, confidence: 1.0 },
    ];

    const status = derivePaperStatus(papers, relations);
    expect(status).toEqual({
      R1: "review",
      S1: "subsumed",
      S2: "novel",
    });
  });

  it("returns no-reviews when there are no review papers", () => {
    const papers = [
      makePaper("S1", { studyType: "rct" }),
      makePaper("S2", { studyType: "cohort" }),
    ];

    const status = derivePaperStatus(papers, []);
    expect(status).toEqual({
      S1: "no-reviews",
      S2: "no-reviews",
    });
  });

  it("marks all non-review papers as novel when no relations exist", () => {
    const papers = [
      makePaper("R1", { studyType: "meta-analysis" }),
      makePaper("S1", { studyType: "rct" }),
    ];

    const status = derivePaperStatus(papers, []);
    expect(status).toEqual({
      R1: "review",
      S1: "novel",
    });
  });

  it("handles study subsumed by multiple reviews", () => {
    const papers = [
      makePaper("R1", { studyType: "meta-analysis" }),
      makePaper("R2", { studyType: "systematic-review" }),
      makePaper("S1", { studyType: "rct" }),
    ];
    const relations = [
      { reviewId: "R1", studyId: "S1", detectionMethod: "citation-graph" as const, confidence: 1.0 },
      { reviewId: "R2", studyId: "S1", detectionMethod: "llm-fallback" as const, confidence: 0.7 },
    ];

    const status = derivePaperStatus(papers, relations);
    expect(status.S1).toBe("subsumed");
  });
});
