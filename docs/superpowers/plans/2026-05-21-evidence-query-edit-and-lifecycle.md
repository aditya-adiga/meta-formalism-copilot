# Editable Evidence Queries + Result Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit the OpenAlex search queries and re-run them, merging new results into a per-claim slot where each paper carries a lifecycle status (retrieved / evaluated / pruned), with soft prune that survives re-runs.

**Architecture:** Status lives on each `EvidencePaper` (not a parallel map) so it cannot drift. All state transitions are Zustand store actions in `evidenceStore`. The search API gains an optional sanitized `queries` override that skips LLM query generation. Re-running search on an existing slot merges (existing papers win) instead of replacing.

**Tech Stack:** Next.js (App Router), TypeScript, Zustand (+ persist middleware), Vitest + React Testing Library, OpenAlex REST API.

**Spec:** `docs/superpowers/plans/../specs/2026-05-21-evidence-query-edit-and-lifecycle-design.md`

---

## File Structure

**Types & API utilities**
- Modify `app/lib/types/evidence.ts` — `EvidencePaperStatus` type, `status` field on `EvidencePaper`, status-aware `isSlotScored`, optional `queries` on `EvidenceSearchRequest`.
- Modify `app/api/evidence-search/openAlexUtils.ts` — `mapOpenAlexWork` sets `status: "retrieved"`.
- Modify `app/api/evidence-search/openAlexUtils.test.ts` — fixture `makePaper` gains `status`.
- Create `app/api/evidence-search/querySanitize.ts` — `sanitizeQueries` pure helper.
- Create `app/api/evidence-search/querySanitize.test.ts`.
- Modify `app/api/evidence-search/route.ts` — use the override when present.

**Store**
- Modify `app/lib/stores/evidenceStore.ts` — `mergeEvidence`, `prunePaper`, `restorePaper`, status bump in `applyScores`, exported `migrateEvidenceState` + versioned persist.
- Create `app/lib/stores/__tests__/evidenceStore.test.ts`.

**Hooks**
- Modify `app/hooks/useEvidenceSearch.ts` — `queries` arg, merge-vs-create, expose `prune`/`restore`.
- Modify `app/hooks/useEvidenceScoring.ts` — exclude pruned papers from scoring payload.

**UI**
- Create `app/components/features/evidence-search/EvidenceQueryEditor.tsx` + `.test.tsx`.
- Modify `app/components/features/evidence-search/EvidencePaperCard.tsx` + create `.test.tsx`.
- Modify `app/components/features/evidence-search/EvidenceResultsSection.tsx`.
- Modify `app/components/features/evidence-search/FindEvidenceButton.tsx`.

**Docs**
- Modify `docs/example-workspace.json`, `docs/USER_GUIDE.md`, `docs/ARCHITECTURE.md`, `CLAUDE.md` as needed.

---

## Task 1: Add lifecycle status to the data model

**Files:**
- Modify: `app/lib/types/evidence.ts`
- Modify: `app/api/evidence-search/openAlexUtils.ts:65-83` (`mapOpenAlexWork`)
- Modify: `app/api/evidence-search/openAlexUtils.test.ts:115-128` (`makePaper` fixture)
- Test: `app/lib/types/evidence.test.ts` (new)

- [ ] **Step 1: Write the failing test for the status type + isSlotScored**

Create `app/lib/types/evidence.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- evidence.test.ts`
Expected: FAIL — `EVIDENCE_PAPER_STATUSES` is not exported and `status` is not a property of `EvidencePaper` (type error / undefined).

- [ ] **Step 3: Add the status type, field, and status-aware isSlotScored**

In `app/lib/types/evidence.ts`, add after the `StudyType` block (near the other `as const` exports):

```ts
// ---------------------------------------------------------------------------
// Paper lifecycle status
// ---------------------------------------------------------------------------

/** Lifecycle status of a paper within a slot. Reflects a step that HAS
 *  happened (a read-out), not a manual cause:
 *   - retrieved:  default when search returns it
 *   - evaluated:  set automatically when reliability/relatedness scoring lands
 *   - integrated: reserved — no setter yet (artifact integration not built)
 *   - pruned:     user dismissed it (soft; recoverable, survives re-runs)
 *  Status keys off the slot (= one claim), so it already models per-(paper,
 *  claim) status and a future shared-paper-pool view can reuse this type. */
export const EVIDENCE_PAPER_STATUSES = [
  "retrieved",
  "evaluated",
  "integrated",
  "pruned",
] as const;
export type EvidencePaperStatus = (typeof EVIDENCE_PAPER_STATUSES)[number];
```

Add the field to `EvidencePaper` (after `relatedness`):

```ts
  /** Per-paper relatedness to the claim (null until scored) */
  relatedness: RelatednessScore | null;
  /** Lifecycle status within this slot (see EvidencePaperStatus) */
  status: EvidencePaperStatus;
};
```

Replace `isSlotScored` with the status-aware version:

```ts
/** Whether every *active* (non-pruned) paper in a slot has been scored.
 *  Pruned papers are intentionally never scored, so they must not block the
 *  slot's "scored" state. Derived from the papers (not stored) so it cannot
 *  drift from the actual scores. */
export function isSlotScored(slot: EvidenceSlot): boolean {
  const active = slot.papers.filter((p) => p.status !== "pruned");
  return active.length > 0 && active.every((p) => p.reliability !== null);
}
```

Add the optional override to `EvidenceSearchRequest`:

```ts
/** API request shape for evidence search */
export type EvidenceSearchRequest = {
  artifactType: EvidenceArtifactType;
  elementId: string;
  elementContent: string;
  contextSummary?: string;
  /** When present and non-empty, search these queries directly instead of
   *  generating them via the LLM. Sanitized server-side. */
  queries?: string[];
};
```

- [ ] **Step 4: Set status in mapOpenAlexWork and fix the dedup fixture**

In `app/api/evidence-search/openAlexUtils.ts`, in the object returned by `mapOpenAlexWork`, add after `relatedness: null,`:

```ts
    reliability: null,
    relatedness: null,
    status: "retrieved",
  };
}
```

In `app/api/evidence-search/openAlexUtils.test.ts`, add `status` to the `makePaper` helper (after `relatedness: null,`):

```ts
    reliability: null,
    relatedness: null,
    status: "retrieved",
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- evidence.test.ts openAlexUtils.test.ts`
Expected: PASS (all). Also run `npm run lint` — expect no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/types/evidence.ts app/lib/types/evidence.test.ts app/api/evidence-search/openAlexUtils.ts app/api/evidence-search/openAlexUtils.test.ts
git commit -m "feat: add lifecycle status to EvidencePaper, status-aware isSlotScored"
```

---

## Task 2: Query override sanitization in the search API

**Files:**
- Create: `app/api/evidence-search/querySanitize.ts`
- Test: `app/api/evidence-search/querySanitize.test.ts`
- Modify: `app/api/evidence-search/route.ts:155-165`

- [ ] **Step 1: Write the failing test**

Create `app/api/evidence-search/querySanitize.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- querySanitize.test.ts`
Expected: FAIL — module `./querySanitize` not found.

- [ ] **Step 3: Implement the helper**

Create `app/api/evidence-search/querySanitize.ts`:

```ts
/** Sanitizes a user-supplied query override for the evidence search API.
 *
 * Users can edit the OpenAlex search queries in the UI and re-run. This
 * bounds untrusted input before it is sent to OpenAlex: only non-empty
 * trimmed strings, each capped in length, and the list capped in count. */

/** Max number of override queries accepted (mirrors the 2-3 the LLM emits,
 *  with headroom). */
export const MAX_OVERRIDE_QUERIES = 5;
/** Max characters per query. */
export const MAX_QUERY_LENGTH = 100;

export function sanitizeQueries(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned: string[] = [];
  for (const entry of input) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().slice(0, MAX_QUERY_LENGTH);
    if (trimmed.length > 0) cleaned.push(trimmed);
    if (cleaned.length >= MAX_OVERRIDE_QUERIES) break;
  }
  return cleaned;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- querySanitize.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the override into the route**

In `app/api/evidence-search/route.ts`, add the import near the top with the other local imports:

```ts
import { sanitizeQueries } from "./querySanitize";
```

Replace Step 1 of the handler (currently `const queries = await generateSearchQueries(...)` around line 160) with:

```ts
    // Cap element content length to avoid runaway LLM token usage
    const elementContent = body.elementContent.slice(0, MAX_ELEMENT_CONTENT_LENGTH);

    // Step 1: Use the caller's edited queries when provided, else generate.
    const override = sanitizeQueries(body.queries);
    const queries =
      override.length > 0
        ? override
        : await generateSearchQueries(elementContent, body.contextSummary);
```

Also update the stale comment on the `Promise.allSettled` spread (the override allows up to 5 queries):

```ts
    // Safe to spread: max PER_QUERY_RESULTS × MAX_OVERRIDE_QUERIES (5) results,
    // well under the argument-count stack limit.
```

- [ ] **Step 6: Run tests + lint**

Run: `npm test -- querySanitize.test.ts && npm run lint`
Expected: PASS, no new lint errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/evidence-search/querySanitize.ts app/api/evidence-search/querySanitize.test.ts app/api/evidence-search/route.ts
git commit -m "feat: accept sanitized query override in evidence-search API"
```

---

## Task 3: Store actions — merge, prune, restore, status-on-score, migration

**Files:**
- Modify: `app/lib/stores/evidenceStore.ts`
- Test: `app/lib/stores/__tests__/evidenceStore.test.ts` (new)

- [ ] **Step 1: Write the failing store test**

Create `app/lib/stores/__tests__/evidenceStore.test.ts`:

```ts
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
    // Re-run returns W1 again as a fresh 'retrieved' paper
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
    expect(papers[1].status).toBe("pruned"); // status untouched even if a score arrives
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- evidenceStore.test.ts`
Expected: FAIL — `mergeEvidence`, `prunePaper`, `restorePaper`, `migrateEvidenceState` are not exported / not defined.

- [ ] **Step 3: Add the migration function**

In `app/lib/stores/evidenceStore.ts`, update the type import to include `EvidencePaper`:

```ts
import type { EvidencePaper, EvidenceSlot, PaperScore } from "@/app/lib/types/evidence";
```

Add this exported function above the `useEvidenceStore` definition (after `DEFAULT_STATE`):

```ts
/** Migrate persisted evidence state across store versions.
 *  v0 -> v1: backfill `status` on papers (evaluated if already scored, else
 *  retrieved). Exported for direct unit testing. */
export function migrateEvidenceState(persistedState: unknown, version: number): unknown {
  const state = persistedState as { slots?: Record<string, EvidenceSlot> } | null;
  if (!state || typeof state !== "object" || !state.slots) return persistedState;
  if (version >= 1) return persistedState;

  const slots: Record<string, EvidenceSlot> = {};
  for (const [key, slot] of Object.entries(state.slots)) {
    slots[key] = {
      ...slot,
      papers: slot.papers.map((p) => {
        const existing = (p as Partial<EvidencePaper>).status;
        return {
          ...p,
          status: existing ?? (p.reliability ? "evaluated" : "retrieved"),
        } as EvidencePaper;
      }),
    };
  }
  return { ...state, slots };
}
```

- [ ] **Step 4: Add merge / prune / restore actions and bump status in applyScores**

Add the three actions to the `EvidenceActions` interface:

```ts
  /** Apply LLM scores to papers in a slot */
  applyScores: (key: string, scores: PaperScore[]) => void;
  /** Merge freshly-searched papers into an existing slot (dedup by id,
   *  existing papers win) and replace the slot's query list. */
  mergeEvidence: (key: string, queries: string[], newPapers: EvidencePaper[]) => void;
  /** Soft-prune a paper (status -> pruned). */
  prunePaper: (key: string, openAlexId: string) => void;
  /** Restore a pruned paper (status -> evaluated if scored, else retrieved). */
  restorePaper: (key: string, openAlexId: string) => void;
  clearEvidence: (key: string) => void;
```

In `applyScores`, change the mapped object to bump status:

```ts
          const updatedPapers = slot.papers.map((paper) => {
            const score = scoreMap.get(paper.openAlexId);
            if (!score) return paper;
            return {
              ...paper,
              reliability: score.reliability,
              relatedness: score.relatedness,
              // Status reflects the scoring step having completed. Only an
              // active 'retrieved' paper advances; pruned/integrated are left
              // as-is even if a stray score arrives.
              status: paper.status === "retrieved" ? "evaluated" : paper.status,
            };
          });
```

Add the three new action implementations after `applyScores`:

```ts
      mergeEvidence: (key, queries, newPapers) =>
        set((state) => {
          const slot = state.slots[key];
          if (!slot) return {};
          const existingIds = new Set(slot.papers.map((p) => p.openAlexId));
          const additions = newPapers.filter((p) => !existingIds.has(p.openAlexId));
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: [...slot.papers, ...additions],
                searchQueries: queries,
                searchedAt: new Date().toISOString(),
              },
            },
          };
        }),

      prunePaper: (key, openAlexId) =>
        set((state) => {
          const slot = state.slots[key];
          if (!slot) return {};
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: slot.papers.map((p) =>
                  p.openAlexId === openAlexId ? { ...p, status: "pruned" } : p,
                ),
              },
            },
          };
        }),

      restorePaper: (key, openAlexId) =>
        set((state) => {
          const slot = state.slots[key];
          if (!slot) return {};
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: slot.papers.map((p) =>
                  p.openAlexId === openAlexId
                    ? { ...p, status: p.reliability ? "evaluated" : "retrieved" }
                    : p,
                ),
              },
            },
          };
        }),
```

- [ ] **Step 5: Register the migration in the persist config**

In the `persist(...)` options object (currently `name: "evidence-store-v1"`), add `version` and `migrate`:

```ts
    {
      name: "evidence-store-v1",
      version: 1,
      migrate: migrateEvidenceState,
      storage: typeof window !== "undefined"
        ? createJSONStorage(() => debouncedStorage)
        : undefined,
      partialize: (state: EvidenceState & EvidenceActions) => ({ slots: state.slots }),
      skipHydration: true,
    },
```

- [ ] **Step 6: Run tests + lint**

Run: `npm test -- evidenceStore.test.ts && npm run lint`
Expected: PASS, no new lint errors.

- [ ] **Step 7: Commit**

```bash
git add app/lib/stores/evidenceStore.ts app/lib/stores/__tests__/evidenceStore.test.ts
git commit -m "feat: evidence store merge/prune/restore actions, status-on-score, v1 migration"
```

---

## Task 4: Hooks — merge-on-rerun, query override, exclude pruned from scoring

**Files:**
- Modify: `app/hooks/useEvidenceSearch.ts`
- Modify: `app/hooks/useEvidenceScoring.ts`

> Note: these hooks are driven through UI integration tests in later tasks; here we make the changes and rely on `npm run lint` + the build to verify the wiring (the existing project has no standalone hook tests for evidence). The behavior is covered end-to-end by the component tests in Tasks 5-7 and by the store tests in Task 3.

- [ ] **Step 1: Update useEvidenceSearch to accept a query override and merge**

In `app/hooks/useEvidenceSearch.ts`, replace the `search` callback and the return value. The new `search` takes an optional `queries` argument, creates the slot on first search and merges on subsequent searches, and the hook also exposes `prune`/`restore`:

```ts
  const search = useCallback(
    async (elementContent: string, contextSummary?: string, queries?: string[]) => {
      const { setLoading, setEvidence, mergeEvidence, setError } = useEvidenceStore.getState();
      setLoading(key, true);
      setError(key, null);
      try {
        const result = await fetchApi<EvidenceSearchResponse>(
          "/api/evidence-search",
          { artifactType, elementId, elementContent, contextSummary, queries },
        );
        const existing = useEvidenceStore.getState().slots[key];
        if (existing) {
          // Re-run: merge new results, preserving prune/score status.
          mergeEvidence(key, result.queries, result.papers);
        } else {
          setEvidence(key, {
            targetKey: { artifactType, elementId },
            searchQueries: result.queries,
            papers: result.papers,
            searchedAt: new Date().toISOString(),
            scoredAt: null,
          });
        }
      } catch (err) {
        console.error("[useEvidenceSearch]", err);
        const message = err instanceof Error ? err.message : "Evidence search failed";
        setError(key, message);
      } finally {
        useEvidenceStore.getState().setLoading(key, false);
      }
    },
    [artifactType, elementId, key],
  );

  const prune = useCallback(
    (openAlexId: string) => useEvidenceStore.getState().prunePaper(key, openAlexId),
    [key],
  );
  const restore = useCallback(
    (openAlexId: string) => useEvidenceStore.getState().restorePaper(key, openAlexId),
    [key],
  );

  return { slot, isLoading, error, search, prune, restore };
```

- [ ] **Step 2: Exclude pruned papers from the scoring payload**

In `app/hooks/useEvidenceScoring.ts`, inside the `score` callback, replace the guard and payload construction. Change the early return to count active papers, and filter pruned out of the payload:

```ts
      const currentSlot = useEvidenceStore.getState().slots[key];
      const activePapers = currentSlot?.papers.filter((p) => p.status !== "pruned") ?? [];
      if (activePapers.length === 0) return;
      // Guard against concurrent scoring calls (e.g. double-click)
      if (useEvidenceStore.getState().scoring[key]) return;

      setScoring(key, true);
      setScoringError(key, null);
      try {
        const result = await fetchApi<EvidenceScoreResponse>(
          "/api/evidence-score",
          {
            claimContent,
            papers: activePapers.map((p) => ({
              openAlexId: p.openAlexId,
              title: p.title,
              authors: p.authors,
              year: p.year,
              abstract: p.abstract,
              journal: p.journal,
            })),
          },
        );
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run lint && npm test -- evidenceStore.test.ts`
Expected: no new lint errors; store tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add app/hooks/useEvidenceSearch.ts app/hooks/useEvidenceScoring.ts
git commit -m "feat: merge-on-rerun + query override in search hook, exclude pruned from scoring"
```

---

## Task 5: EvidenceQueryEditor component

**Files:**
- Create: `app/components/features/evidence-search/EvidenceQueryEditor.tsx`
- Test: `app/components/features/evidence-search/EvidenceQueryEditor.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `app/components/features/evidence-search/EvidenceQueryEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvidenceQueryEditor from "./EvidenceQueryEditor";

describe("EvidenceQueryEditor", () => {
  it("renders one input per query", () => {
    render(<EvidenceQueryEditor queries={["alpha", "beta"]} isLoading={false} onRerun={() => {}} />);
    expect(screen.getByDisplayValue("alpha")).toBeInTheDocument();
    expect(screen.getByDisplayValue("beta")).toBeInTheDocument();
  });

  it("adds and removes query rows", async () => {
    render(<EvidenceQueryEditor queries={["alpha"]} isLoading={false} onRerun={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /add query/i }));
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);

    await userEvent.click(screen.getAllByRole("button", { name: /remove query/i })[0]);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("calls onRerun with the trimmed, non-empty query list", async () => {
    const onRerun = vi.fn();
    render(<EvidenceQueryEditor queries={["alpha"]} isLoading={false} onRerun={onRerun} />);
    await userEvent.click(screen.getByRole("button", { name: /add query/i }));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[1], "  beta  ");
    await userEvent.click(screen.getByRole("button", { name: /re-run/i }));
    expect(onRerun).toHaveBeenCalledWith(["alpha", "beta"]);
  });

  it("disables the re-run button while loading", () => {
    render(<EvidenceQueryEditor queries={["alpha"]} isLoading onRerun={() => {}} />);
    expect(screen.getByRole("button", { name: /searching/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- EvidenceQueryEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `app/components/features/evidence-search/EvidenceQueryEditor.tsx`:

```tsx
"use client";

import { useState } from "react";

type EvidenceQueryEditorProps = {
  /** Queries from the most recent run; seeds the editable list. */
  queries: string[];
  /** True while a search is in flight. */
  isLoading: boolean;
  /** Called with the trimmed, non-empty query list when the user re-runs. */
  onRerun: (queries: string[]) => void;
};

/** Inline editor for the OpenAlex search queries. Replaces the read-only
 *  "Searched: …" line so users can refine queries and re-run. */
export default function EvidenceQueryEditor({
  queries,
  isLoading,
  onRerun,
}: EvidenceQueryEditorProps) {
  // Seed once from props; the user's edits are local until they re-run.
  const [draft, setDraft] = useState<string[]>(queries.length > 0 ? queries : [""]);

  const updateAt = (i: number, value: string) =>
    setDraft((d) => d.map((q, idx) => (idx === i ? value : q)));
  const removeAt = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));
  const addRow = () => setDraft((d) => [...d, ""]);

  const handleRerun = () => {
    const cleaned = draft.map((q) => q.trim()).filter((q) => q.length > 0);
    if (cleaned.length === 0) return;
    onRerun(cleaned);
  };

  return (
    <div className="mt-2 space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wide text-[#9A9590]">
        Search queries
      </div>
      {draft.map((q, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            value={q}
            onChange={(e) => updateAt(i, e.target.value)}
            className="min-w-0 flex-1 rounded border border-[#DDD9D5] bg-white px-2 py-1 text-xs text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
          />
          <button
            type="button"
            aria-label="Remove query"
            onClick={() => removeAt(i)}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-[#9A9590] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
          >
            &#10005;
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded text-xs text-[#6B6560] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
        >
          + add query
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={handleRerun}
          className="ml-auto rounded-md border border-[#DDD9D5] px-2 py-0.5 text-xs text-[#6B6560] hover:bg-[#F5F1ED] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30 active:bg-[#ECE7E2] disabled:cursor-wait disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Re-run ⟳"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- EvidenceQueryEditor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/features/evidence-search/EvidenceQueryEditor.tsx app/components/features/evidence-search/EvidenceQueryEditor.test.tsx
git commit -m "feat: EvidenceQueryEditor inline query editing component"
```

---

## Task 6: EvidencePaperCard — status chip + prune/restore

**Files:**
- Modify: `app/components/features/evidence-search/EvidencePaperCard.tsx`
- Test: `app/components/features/evidence-search/EvidencePaperCard.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `app/components/features/evidence-search/EvidencePaperCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvidencePaperCard from "./EvidencePaperCard";
import type { EvidencePaper } from "@/app/lib/types/evidence";

const paper = (over: Partial<EvidencePaper>): EvidencePaper => ({
  openAlexId: "W1",
  title: "Defaults and retirement savings",
  authors: ["Thaler"],
  year: 2008,
  abstract: null,
  citedByCount: 10,
  journal: null,
  doi: null,
  oaUrl: null,
  reliability: null,
  relatedness: null,
  status: "retrieved",
  ...over,
});

describe("EvidencePaperCard prune/restore", () => {
  it("shows a prune control on an active paper and calls onPrune", async () => {
    const onPrune = vi.fn();
    render(<EvidencePaperCard paper={paper({})} onPrune={onPrune} onRestore={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /prune/i }));
    expect(onPrune).toHaveBeenCalledTimes(1);
  });

  it("shows a restore control on a pruned paper and calls onRestore", async () => {
    const onRestore = vi.fn();
    render(
      <EvidencePaperCard paper={paper({ status: "pruned" })} onPrune={() => {}} onRestore={onRestore} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("renders the lifecycle status label", () => {
    render(<EvidencePaperCard paper={paper({ status: "evaluated" })} onPrune={() => {}} onRestore={() => {}} />);
    expect(screen.getByText(/evaluated/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- EvidencePaperCard.test.tsx`
Expected: FAIL — `onPrune`/`onRestore` props don't exist; no prune/restore buttons.

- [ ] **Step 3: Add status chip + prune/restore to the card**

In `app/components/features/evidence-search/EvidencePaperCard.tsx`, update the type import and the component signature/props:

```tsx
import type { EvidencePaper, EvidencePaperStatus } from "@/app/lib/types/evidence";
```

Add a status-label map near the top (after `ABSTRACT_TRUNCATE`):

```tsx
const STATUS_LABELS: Record<EvidencePaperStatus, string> = {
  retrieved: "Retrieved",
  evaluated: "Evaluated",
  integrated: "Integrated",
  pruned: "Pruned",
};
```

Change the component signature and add the pruned-dimming wrapper class:

```tsx
export default function EvidencePaperCard({
  paper,
  onPrune,
  onRestore,
}: {
  paper: EvidencePaper;
  onPrune: () => void;
  onRestore: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const url = paperUrl(paper);
  const needsTruncation = paper.abstract && paper.abstract.length > ABSTRACT_TRUNCATE;
  const hasScores = paper.reliability !== null || paper.relatedness !== null;
  const isPruned = paper.status === "pruned";

  return (
    <div
      className={`rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-1 ${
        isPruned ? "opacity-50" : ""
      }`}
    >
```

In the title-row `<div className="flex items-center gap-1 shrink-0">` that holds the score badges, add the status chip and the prune/restore button alongside the badges. Replace that block with:

```tsx
        {/* Status chip + score badges + prune/restore */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="rounded bg-[#F0ECE8] px-1.5 py-0.5 text-[10px] font-mono text-[#6B6560]">
            {STATUS_LABELS[paper.status]}
          </span>
          {paper.reliability && (
            <EvidenceScoreBadge
              label="Rel"
              score={paper.reliability.score}
              tooltip={`Reliability: ${paper.reliability.rationale}`}
            />
          )}
          {paper.relatedness && (
            <EvidenceScoreBadge
              label="Fit"
              score={paper.relatedness.score}
              tooltip={`Relatedness: ${paper.relatedness.rationale}`}
            />
          )}
          <button
            type="button"
            aria-label={isPruned ? "Restore paper" : "Prune paper"}
            onClick={isPruned ? onRestore : onPrune}
            className="rounded px-1.5 py-0.5 text-[10px] text-[#9A9590] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
          >
            {isPruned ? "Restore" : "Prune"}
          </button>
        </div>
```

Note: the old code only rendered the badge container `{hasScores && (...)}`. The new container always renders (status chip + prune control are always shown), so remove the `{hasScores && (` guard wrapper around it; the individual badges keep their own `paper.reliability &&` / `paper.relatedness &&` guards. The `hasScores` variable is now only used... if unused after this, delete its declaration to satisfy lint.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- EvidencePaperCard.test.tsx && npm run lint`
Expected: PASS, no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add app/components/features/evidence-search/EvidencePaperCard.tsx app/components/features/evidence-search/EvidencePaperCard.test.tsx
git commit -m "feat: status chip + prune/restore controls on EvidencePaperCard"
```

---

## Task 7: Wire query editor + lifecycle into the results section and button

**Files:**
- Modify: `app/components/features/evidence-search/EvidenceResultsSection.tsx`
- Modify: `app/components/features/evidence-search/FindEvidenceButton.tsx`
- Test: `app/components/features/evidence-search/EvidenceResultsSection.test.tsx` (new)

- [ ] **Step 1: Write the failing integration test for partitioning + re-run**

Create `app/components/features/evidence-search/EvidenceResultsSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvidenceResultsSection from "./EvidenceResultsSection";
import type { EvidencePaper, EvidenceSlot } from "@/app/lib/types/evidence";

const paper = (id: string, status: EvidencePaper["status"]): EvidencePaper => ({
  openAlexId: id,
  title: `Paper ${id}`,
  authors: [],
  year: null,
  abstract: null,
  citedByCount: 0,
  journal: null,
  doi: null,
  oaUrl: null,
  reliability: null,
  relatedness: null,
  status,
});

const slot = (papers: EvidencePaper[]): EvidenceSlot => ({
  targetKey: { artifactType: "statistical-model", elementId: "artifact" },
  searchQueries: ["alpha"],
  papers,
  searchedAt: "2026-05-21T00:00:00.000Z",
  scoredAt: null,
});

const noop = () => {};

describe("EvidenceResultsSection", () => {
  it("counts only active papers and groups pruned separately", () => {
    render(
      <EvidenceResultsSection
        slot={slot([paper("W1", "retrieved"), paper("W2", "pruned")])}
        onRerun={noop}
        onPrune={noop}
        onRestore={noop}
      />,
    );
    expect(screen.getByText(/1 paper found/i)).toBeInTheDocument();
    expect(screen.getByText(/pruned \(1\)/i)).toBeInTheDocument();
  });

  it("re-runs with the edited queries", async () => {
    const onRerun = vi.fn();
    render(
      <EvidenceResultsSection
        slot={slot([paper("W1", "retrieved")])}
        onRerun={onRerun}
        onPrune={noop}
        onRestore={noop}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add query/i }));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[1], "beta");
    await userEvent.click(screen.getByRole("button", { name: /re-run/i }));
    expect(onRerun).toHaveBeenCalledWith(["alpha", "beta"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- EvidenceResultsSection.test.tsx`
Expected: FAIL — props `onRerun`/`onPrune`/`onRestore` don't exist; no pruned group; query editor absent.

- [ ] **Step 3: Rewrite EvidenceResultsSection to partition + host the editor**

Replace the full contents of `app/components/features/evidence-search/EvidenceResultsSection.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { isSlotScored, type EvidencePaper, type EvidenceSlot } from "@/app/lib/types/evidence";
import EvidencePaperCard from "./EvidencePaperCard";
import EvidenceQueryEditor from "./EvidenceQueryEditor";

/** Sort papers by combined score (reliability + relatedness) descending.
 *  Unscored papers sort to the end. */
function sortByScore(papers: EvidencePaper[]): EvidencePaper[] {
  return [...papers].sort((a, b) => {
    const scoreA = (a.reliability?.score ?? -1) + (a.relatedness?.score ?? -1);
    const scoreB = (b.reliability?.score ?? -1) + (b.relatedness?.score ?? -1);
    return scoreB - scoreA;
  });
}

type EvidenceResultsSectionProps = {
  slot: EvidenceSlot;
  /** Re-run search with the edited queries. */
  onRerun: (queries: string[]) => void;
  /** Soft-prune a paper by id. */
  onPrune: (openAlexId: string) => void;
  /** Restore a pruned paper by id. */
  onRestore: (openAlexId: string) => void;
  /** Callback to trigger scoring — rendered as a button if provided. */
  onScore?: () => void;
  /** Whether scoring is currently in progress. */
  isScoring?: boolean;
  /** Whether a search is currently in progress. */
  isLoading?: boolean;
};

export default function EvidenceResultsSection({
  slot,
  onRerun,
  onPrune,
  onRestore,
  onScore,
  isScoring,
  isLoading = false,
}: EvidenceResultsSectionProps) {
  const [open, setOpen] = useState(true);
  const [showPruned, setShowPruned] = useState(false);

  const active = useMemo(
    () => slot.papers.filter((p) => p.status !== "pruned"),
    [slot.papers],
  );
  const pruned = useMemo(
    () => slot.papers.filter((p) => p.status === "pruned"),
    [slot.papers],
  );
  const scored = isSlotScored(slot);
  const count = active.length;

  const displayPapers = useMemo(() => {
    if (scored) return sortByScore(active);
    return active;
  }, [active, scored]);

  return (
    <div className="mt-2 border-t border-[#DDD9D5] pt-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 rounded text-xs font-medium text-[#6B6560] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
        >
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          {count === 0
            ? "No papers found"
            : `${count} paper${count === 1 ? "" : "s"} found`}
          {scored && <span className="text-[10px] text-[#9A9590] ml-1">(scored)</span>}
        </button>

        {onScore && count > 0 && (
          <button
            type="button"
            disabled={isScoring}
            onClick={onScore}
            className="text-xs text-[#6B6560] hover:text-[var(--ink-black)] border border-[#DDD9D5] rounded px-2 py-1 hover:bg-[#F5F1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30 active:bg-[#ECE7E2] disabled:opacity-50 disabled:cursor-wait"
          >
            {isScoring ? "Scoring..." : scored ? "Re-score" : "Score papers"}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {count === 0 && (
            <p className="text-xs text-[#9A9590]">
              No relevant papers were found. Edit the queries below and re-run, or refine the element content.
            </p>
          )}

          {displayPapers.map((paper) => (
            <EvidencePaperCard
              key={paper.openAlexId}
              paper={paper}
              onPrune={() => onPrune(paper.openAlexId)}
              onRestore={() => onRestore(paper.openAlexId)}
            />
          ))}

          {pruned.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowPruned((s) => !s)}
                className="rounded text-[10px] text-[#9A9590] hover:text-[var(--ink-black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30"
              >
                {showPruned ? "Hide" : "Show"} pruned ({pruned.length})
              </button>
              {showPruned && (
                <div className="mt-1 space-y-2">
                  {pruned.map((paper) => (
                    <EvidencePaperCard
                      key={paper.openAlexId}
                      paper={paper}
                      onPrune={() => onPrune(paper.openAlexId)}
                      onRestore={() => onRestore(paper.openAlexId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editable search queries (replaces the old read-only line) */}
          <EvidenceQueryEditor
            queries={slot.searchQueries}
            isLoading={isLoading}
            onRerun={onRerun}
          />
        </div>
      )}
    </div>
  );
}
```

Note: the test expects `pruned (1)` to be visible without clicking — the `Show pruned (1)` button text contains "pruned (1)", which satisfies `getByText(/pruned \(1\)/i)`.

- [ ] **Step 4: Wire FindEvidenceButton to the new props**

In `app/components/features/evidence-search/FindEvidenceButton.tsx`, pull `prune`/`restore` from the search hook and pass the new props. Replace the hook destructuring and the `EvidenceResultsSection` usage:

```tsx
  const { slot, isLoading, error, search, prune, restore } = useEvidenceSearch(artifactType, elementId);
  const { isScoring, score, error: scoringError } = useEvidenceScoring(artifactType, elementId);
```

```tsx
      {slot && (
        <EvidenceResultsSection
          slot={slot}
          onRerun={(queries) => search(elementContent, contextSummary, queries)}
          onPrune={prune}
          onRestore={restore}
          onScore={() => score(elementContent)}
          isScoring={isScoring}
          isLoading={isLoading}
        />
      )}
```

- [ ] **Step 5: Run tests + lint + build**

Run: `npm test -- EvidenceResultsSection.test.tsx && npm run lint`
Expected: PASS, no new lint errors. Then `npm run build` — expect a successful production build (catches any type errors across the wiring).

- [ ] **Step 6: Commit**

```bash
git add app/components/features/evidence-search/EvidenceResultsSection.tsx app/components/features/evidence-search/EvidenceResultsSection.test.tsx app/components/features/evidence-search/FindEvidenceButton.tsx
git commit -m "feat: wire query editor + prune/restore into evidence results UI"
```

---

## Task 8: Update example data and docs

**Files:**
- Modify: `docs/example-workspace.json` (project root — see CLAUDE.md note that repo `@docs` refers to project root)
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Check whether the example workspace contains evidence papers**

Run: `grep -n "openAlexId" docs/example-workspace.json`
Expected: either no matches (nothing to do for the JSON) or paper objects that need a `status` field.

- [ ] **Step 2: Backfill status in example data if present**

If Step 1 found `openAlexId` entries, add `"status": "retrieved"` (or `"evaluated"` for papers that already carry `reliability`) to each paper object so the example data matches the new required field. If there were no matches, skip — the persist migration handles any real user data, and there is nothing to update here.

- [ ] **Step 3: Document the feature in USER_GUIDE.md**

In `docs/USER_GUIDE.md`, find the evidence-grounding / "Find evidence" section and add a short paragraph:

```markdown
After running **Find evidence**, the search queries appear as editable fields
below the results. Edit them and click **Re-run ⟳** to search again — new
papers are merged in alongside the existing ones (duplicates are skipped). Each
paper shows a lifecycle status (Retrieved → Evaluated once scored) and a
**Prune** control to dismiss it; pruned papers are hidden under a *Show pruned*
toggle and stay pruned even if a later search returns them.
```

(If the user guide has no evidence section yet — the scoring feature is still on an unmerged branch — add the paragraph under the artifact-grounding heading that the scoring branch introduced.)

- [ ] **Step 4: Document the data-flow change in ARCHITECTURE.md**

In `docs/ARCHITECTURE.md`, in the evidence section, note: the `/api/evidence-search` route accepts an optional sanitized `queries[]` override (skips LLM generation); re-running search merges into the slot (existing papers win); each `EvidencePaper` carries a lifecycle `status`; the evidence store persists at `version: 1` with a migration that backfills `status`.

- [ ] **Step 5: Update CLAUDE.md key patterns**

In `app/`-level or root `CLAUDE.md` evidence notes, add a bullet under the evidence pattern: "Evidence papers carry a lifecycle `status` (retrieved/evaluated/integrated/pruned); queries are user-editable and re-runs merge (existing papers win, soft-prune survives re-run)."

- [ ] **Step 6: Run the full test suite + build**

Run: `npm test && npm run lint && npm run build`
Expected: all tests PASS, no lint errors, successful build.

- [ ] **Step 7: Commit**

```bash
git add docs/example-workspace.json docs/USER_GUIDE.md docs/ARCHITECTURE.md CLAUDE.md
git commit -m "docs: document editable queries + result lifecycle"
```

---

## Self-Review Notes

- **Spec coverage:** Inline editable queries → Tasks 5, 7. Merge-on-rerun → Tasks 3, 4. Soft prune that survives re-run → Task 3 (existing-wins dedup) + Task 6 (UI). Lifecycle status as read-out → Task 1 (type), Task 3 (`applyScores` bump), Task 6 (chip). `integrated` reserved/no setter → Task 1 (in type, no action added). Per-(paper,claim) modeled → Task 1 (status on paper-in-slot). Query override sanitization → Task 2. Migration → Task 3. Out-of-scope items (search history, shared pool, citation insertion) → intentionally absent.
- **Status transitions verified consistent:** `retrieved` (mapOpenAlexWork + merge additions), `evaluated` (applyScores bump + restore-when-scored), `pruned` (prunePaper), restore → evaluated/retrieved by score presence. `isSlotScored`, scoring payload, and results partition all key off `status !== "pruned"` identically.
- **Naming consistency:** store actions `mergeEvidence` / `prunePaper` / `restorePaper`; hook exposes `prune` / `restore`; component props `onRerun` / `onPrune` / `onRestore`. `EVIDENCE_PAPER_STATUSES` / `EvidencePaperStatus` used in types, store, and card.
