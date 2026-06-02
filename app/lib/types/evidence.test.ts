import { describe, it, expect } from "vitest";
import {
  isSlotScored,
  EVIDENCE_PAPER_STATUSES,
  type EvidencePaper,
  type EvidenceSlot,
} from "./evidence";

const basePaper = (over: Partial<EvidencePaper>): EvidencePaper => ({
  openAlexId: "W1",
  title: "t",
  authors: [],
  year: null,
  abstract: null,
  citedByCount: 0,
  journal: null,
  doi: null,
  oaUrl: null,
  reliability: null,
  relatedness: null,
  status: "retrieved",
  ...over,
});

const slotWith = (papers: EvidencePaper[]): EvidenceSlot => ({
  targetKey: { artifactType: "statistical-model", elementId: "artifact" },
  searchQueries: ["q"],
  papers,
  searchedAt: "2026-05-21T00:00:00.000Z",
  scoredAt: null,
});

const scored = { score: 0.8, studyType: "rct" as const, rationale: "", redFlags: [] };
const related = { score: 0.7, rationale: "" };

describe("EVIDENCE_PAPER_STATUSES", () => {
  it("lists the four lifecycle states", () => {
    expect(EVIDENCE_PAPER_STATUSES).toEqual([
      "retrieved",
      "evaluated",
      "integrated",
      "pruned",
    ]);
  });
});

describe("isSlotScored (status-aware)", () => {
  it("is false for an empty slot", () => {
    expect(isSlotScored(slotWith([]))).toBe(false);
  });

  it("is true when all non-pruned papers are scored", () => {
    const slot = slotWith([
      basePaper({ openAlexId: "W1", reliability: scored, relatedness: related, status: "evaluated" }),
    ]);
    expect(isSlotScored(slot)).toBe(true);
  });

  it("ignores pruned papers when deciding scored-ness", () => {
    const slot = slotWith([
      basePaper({ openAlexId: "W1", reliability: scored, relatedness: related, status: "evaluated" }),
      basePaper({ openAlexId: "W2", reliability: null, relatedness: null, status: "pruned" }),
    ]);
    expect(isSlotScored(slot)).toBe(true);
  });

  it("is false when an active paper is unscored", () => {
    const slot = slotWith([
      basePaper({ openAlexId: "W1", reliability: scored, relatedness: related, status: "evaluated" }),
      basePaper({ openAlexId: "W2", reliability: null, relatedness: null, status: "retrieved" }),
    ]);
    expect(isSlotScored(slot)).toBe(false);
  });

  it("is false when every paper is pruned (no active scored papers)", () => {
    const slot = slotWith([
      basePaper({ openAlexId: "W1", reliability: scored, relatedness: related, status: "pruned" }),
    ]);
    expect(isSlotScored(slot)).toBe(false);
  });
});
