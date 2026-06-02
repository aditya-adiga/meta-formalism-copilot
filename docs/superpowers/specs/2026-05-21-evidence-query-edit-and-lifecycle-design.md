# Editable Evidence Queries + Result Lifecycle — Design

**Date:** 2026-05-21
**Status:** Approved (first pass)
**Base branch:** `feat/evidence-scoring` (the scoring code this design extends is not yet on `main`)

## Problem

The evidence-grounding architecture decision record
(`docs/decisions/001-evidence-grounding-architecture.md:130`) listed *"user can
see and edit queries"* as the mitigation for poor LLM-generated OpenAlex
queries. Only the **see** half shipped: queries render as a read-only muted line
(`EvidenceResultsSection.tsx`), the `/api/evidence-search` route always
regenerates queries via an LLM and accepts no override, and there is no way to
edit them or re-run. Users also have no way to track or curate results over
time.

This design delivers the **edit** half and introduces a lightweight result
lifecycle so users can curate which papers matter.

## Requirements (from brainstorming)

1. **Inline-editable queries.** The read-only `Searched: …` line becomes editable
   text inputs (one per query) with add/remove and a re-run button. Matches the
   app's existing inline-edit conventions.
2. **Merge on re-run.** Re-running search merges new results into the slot
   (deduped by OpenAlex id) rather than wiping. Both an edited-query re-run and
   the existing "Refresh evidence" merge.
3. **Soft prune.** Users can prune a result; it is hidden-but-recoverable. If a
   re-run returns a pruned paper, it **stays pruned** (dedup respects existing
   status).
4. **Result lifecycle status.** Each paper carries a status that *reflects a step
   that happened* (a read-out, not a manual cause):
   - `retrieved` — default when search returns it.
   - `evaluated` — set automatically when reliability/relatedness scoring
     completes for it.
   - `integrated` — defined in the model but **not reachable** this iteration
     (no artifact-integration action exists yet). Reserved.
   - `pruned` — user dismissed it (soft).
5. **Per-(paper, claim) status, modeled but not built out.** Status keys off the
   slot, which already equals one claim, so the type is shaped for a future
   shared-paper-pool / cross-claim view without committing to building it now.

## Architecture

State transitions live in `evidenceStore` (Zustand), matching the existing
pattern where `applyScores` and `isSlotScored` already centralize logic there.
Status lives **on the paper** (not in a parallel map) so it cannot drift from the
paper data — the same anti-drift rationale documented on `isSlotScored`.

### 1. Data model — `app/lib/types/evidence.ts`

```ts
export const EVIDENCE_PAPER_STATUSES = [
  "retrieved",
  "evaluated",
  "integrated",
  "pruned",
] as const;
export type EvidencePaperStatus = (typeof EVIDENCE_PAPER_STATUSES)[number];
```

- Add `status: EvidencePaperStatus` to `EvidencePaper`.
- `isSlotScored(slot)`: consider only non-pruned papers — pruned papers are never
  scored, so they must not block the slot's "scored" state. New definition:
  among non-pruned papers, the slot is scored iff there is ≥1 such paper and all
  have `reliability !== null`.
- `EvidenceSearchRequest` gains optional `queries?: string[]`.

### 2. API — `app/api/evidence-search/route.ts`

- If `body.queries` is a non-empty array: sanitize (trim each, drop empties, cap
  each query to 100 chars, cap to 5 queries) and search those directly, skipping
  the LLM `generateSearchQueries` call.
- If the sanitized array is empty, or `queries` is absent: generate via LLM as
  today.
- The response continues to return `queries` (the queries actually used) so the
  client can display them in the editor.

### 3. Store + hook — status as result, merge, prune

`app/lib/stores/evidenceStore.ts`:

- **`mergeEvidence(key, queries, newPapers)`** — dedup by `openAlexId` with
  **existing papers winning** (preserves their `status` and scores; a pruned
  paper that re-appears stays pruned). New papers enter as `"retrieved"`. Sets
  `searchQueries` to the just-run set and refreshes `searchedAt`. Leaves
  `scoredAt` unchanged.
- **`setPaperStatus(key, openAlexId, status)`** — generic setter used by
  prune/restore (and future `integrated`). Restore maps a pruned paper back to
  `"evaluated"` if it has scores, else `"retrieved"`.
- **`applyScores`** (modified) — when a score lands on a paper whose status is
  `"retrieved"`, bump it to `"evaluated"`. Never overwrite `"pruned"` or
  `"integrated"`.
- **Persist migration** — bump the store to a versioned `migrate` that backfills
  `status` on existing persisted papers (`reliability ? "evaluated" :
  "retrieved"`).

`app/hooks/useEvidenceSearch.ts`:

- `search(elementContent, contextSummary?, queries?)`:
  - Call the API, passing `queries` when provided.
  - If no slot exists for the key → `setEvidence` (create, all papers
    `"retrieved"`).
  - If a slot exists → `mergeEvidence` (preserves prune/score state). This makes
    both "Refresh evidence" and edited-query re-runs non-destructive.

`app/hooks/useEvidenceScoring.ts`:

- Exclude `"pruned"` papers from the scoring payload (don't spend tokens on
  dismissed results).

### 4. UI — query editing

New component `EvidenceQueryEditor`
(`app/components/features/evidence-search/`):

- Props: `{ queries: string[]; isLoading: boolean; onRerun: (queries: string[]) => void }`.
- Renders one text input per query, an `✕` per row to remove, a `+ add query`
  control, and a `Re-run ⟳` button. Local edit state seeded from `queries`;
  `onRerun` is called with the trimmed, non-empty list.
- Replaces the read-only `Searched: …` line in `EvidenceResultsSection`.

`FindEvidenceButton` wires `onRerun` to `search(elementContent, contextSummary,
queries)`.

### 5. UI — result lifecycle

`EvidenceResultsSection`:

- Partition `slot.papers` into **active** (`status !== "pruned"`, shown and
  sorted by score) and **pruned** (collapsed `Pruned (N)` subsection at the
  bottom).
- Header count reflects active papers.

`EvidencePaperCard`:

- New props: `{ onPrune: () => void; onRestore: () => void }`.
- A compact status chip and a prune `✕` (active) / `Restore` (pruned) control.
- Pruned cards render de-emphasized (dimmed).
- Existing Rel/Fit score badges are unchanged — lifecycle status is a separate
  axis from the reliability/relatedness scores.

## Testing

- **Store unit tests:** merge dedup preserves existing status + scores;
  prune-survives-rerun; `applyScores` bumps only `retrieved → evaluated` and
  leaves `pruned`/`integrated` alone; `isSlotScored` ignores pruned papers;
  migration backfills `status`.
- **API test:** `queries` override skips LLM generation and is sanitized
  (trim/empty/length/count); absent or all-empty `queries` falls back to
  generation.
- **Component tests:** `EvidenceQueryEditor` add/remove/re-run emits the right
  query list; prune/restore toggles a card's status.

## Out of scope (this pass)

- **Search history.** Acknowledged as valuable but adds complexity not worth it
  for the first pass — candidate for a follow-up double-diamond exploration.
- **Cross-claim shared paper pool / cross-claim status view.** Type is shaped to
  allow it later; not built.
- **Artifact-text mutation / citation insertion.** No setter for `"integrated"`
  this iteration.
