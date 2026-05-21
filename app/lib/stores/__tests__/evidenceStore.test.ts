import { describe, it, expect, beforeEach } from "vitest";
import { useEvidenceStore, migrateEvidenceState } from "../evidenceStore";
import type { EvidencePaper, EvidenceSlot, PaperScore } from "@/app/lib/types/evidence";

const KEY = "statistical-model::artifact";

const paper = (over: Partial<EvidencePaper>): EvidencePaper => ({
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

const slot = (papers: EvidencePaper[], queries = ["q1"]): EvidenceSlot => ({
  targetKey: { artifactType: "statistical-model", elementId: "artifact" },
  searchQueries: queries,
  papers,
  searchedAt: "2026-05-21T00:00:00.000Z",
  scoredAt: null,
});

const score = (id: string): PaperScore => ({
  openAlexId: id,
  reliability: { score: 0.8, studyType: "rct", rationale: "", redFlags: [] },
  relatedness: { score: 0.7, rationale: "" },
});

beforeEach(() => {
  useEvidenceStore.setState({ slots: {}, loading: {}, scoring: {}, errors: {}, scoringErrors: {} });
});

describe("mergeEvidence", () => {
  it("adds new papers as retrieved and keeps existing papers untouched", () => {
    const { setEvidence, mergeEvidence } = useEvidenceStore.getState();
    setEvidence(KEY, slot([paper({ openAlexId: "W1", status: "evaluated" })]));
    mergeEvidence(KEY, ["q2"], [paper({ openAlexId: "W2" })]);

    const merged = useEvidenceStore.getState().slots[KEY];
    expect(merged.papers.map((p) => p.openAlexId)).toEqual(["W1", "W2"]);
    expect(merged.papers[0].status).toBe("evaluated"); // existing preserved
    expect(merged.papers[1].status).toBe("retrieved");
    expect(merged.searchQueries).toEqual(["q2"]); // queries replaced by last run
  });

  it("existing paper wins on dedup — a returned pruned paper stays pruned", () => {
    const { setEvidence, mergeEvidence } = useEvidenceStore.getState();
    setEvidence(KEY, slot([paper({ openAlexId: "W1", status: "pruned" })]));
    mergeEvidence(KEY, ["q1"], [paper({ openAlexId: "W1", status: "retrieved" })]);

    const merged = useEvidenceStore.getState().slots[KEY];
    expect(merged.papers).toHaveLength(1);
    expect(merged.papers[0].status).toBe("pruned");
  });

  it("is a no-op when the slot does not exist", () => {
    const { mergeEvidence } = useEvidenceStore.getState();
    mergeEvidence("missing", ["q"], [paper({ openAlexId: "W9" })]);
    expect(useEvidenceStore.getState().slots["missing"]).toBeUndefined();
  });
});

describe("prunePaper / restorePaper", () => {
  it("prune sets status to pruned", () => {
    const { setEvidence, prunePaper } = useEvidenceStore.getState();
    setEvidence(KEY, slot([paper({ openAlexId: "W1", status: "retrieved" })]));
    prunePaper(KEY, "W1");
    expect(useEvidenceStore.getState().slots[KEY].papers[0].status).toBe("pruned");
  });

  it("restore returns an unscored paper to retrieved", () => {
    const { setEvidence, prunePaper, restorePaper } = useEvidenceStore.getState();
    setEvidence(KEY, slot([paper({ openAlexId: "W1", status: "retrieved" })]));
    prunePaper(KEY, "W1");
    restorePaper(KEY, "W1");
    expect(useEvidenceStore.getState().slots[KEY].papers[0].status).toBe("retrieved");
  });

  it("restore returns a scored paper to evaluated", () => {
    const { setEvidence, restorePaper } = useEvidenceStore.getState();
    setEvidence(
      KEY,
      slot([
        paper({
          openAlexId: "W1",
          status: "pruned",
          reliability: { score: 0.8, studyType: "rct", rationale: "", redFlags: [] },
        }),
      ]),
    );
    restorePaper(KEY, "W1");
    expect(useEvidenceStore.getState().slots[KEY].papers[0].status).toBe("evaluated");
  });
});

describe("applyScores bumps status", () => {
  it("bumps retrieved -> evaluated and leaves pruned alone", () => {
    const { setEvidence, applyScores } = useEvidenceStore.getState();
    setEvidence(
      KEY,
      slot([
        paper({ openAlexId: "W1", status: "retrieved" }),
        paper({ openAlexId: "W2", status: "pruned" }),
      ]),
    );
    applyScores(KEY, [score("W1"), score("W2")]);

    const papers = useEvidenceStore.getState().slots[KEY].papers;
    expect(papers[0].status).toBe("evaluated");
    expect(papers[0].reliability).not.toBeNull();
    expect(papers[1].status).toBe("pruned");
  });
});

describe("migrateEvidenceState", () => {
  it("backfills status on v0 persisted papers", () => {
    const persisted = {
      slots: {
        [KEY]: {
          targetKey: { artifactType: "statistical-model", elementId: "artifact" },
          searchQueries: ["q"],
          searchedAt: "2026-05-21T00:00:00.000Z",
          scoredAt: null,
          papers: [
            { openAlexId: "W1", reliability: { score: 0.5, studyType: "rct", rationale: "", redFlags: [] } },
            { openAlexId: "W2", reliability: null },
          ],
        },
      },
    };
    const migrated = migrateEvidenceState(persisted, 0) as { slots: Record<string, EvidenceSlot> };
    expect(migrated.slots[KEY].papers[0].status).toBe("evaluated");
    expect(migrated.slots[KEY].papers[1].status).toBe("retrieved");
  });

  it("passes through already-migrated state", () => {
    const state = { slots: { [KEY]: slot([paper({ openAlexId: "W1", status: "pruned" })]) } };
    const migrated = migrateEvidenceState(state, 1) as { slots: Record<string, EvidenceSlot> };
    expect(migrated.slots[KEY].papers[0].status).toBe("pruned");
  });
});
