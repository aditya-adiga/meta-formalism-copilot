# Evidence Query + Lifecycle — Follow-up Ideas (handoff)

**Date:** 2026-05-21
**Context for a fresh session:** This doc lists work deliberately left out of the editable-queries + result-lifecycle feature, so a new session can pick any item up cold.

## Where things stand

- Feature shipped on branch `feat/evidence-query-lifecycle` → **PR #159** (base `feat/evidence-scoring`, which is itself not yet on `main`).
- Design: `docs/superpowers/specs/2026-05-21-evidence-query-edit-and-lifecycle-design.md`
- Plan: `docs/superpowers/plans/2026-05-21-evidence-query-edit-and-lifecycle.md`
- Code lives in `app/components/features/evidence-search/`, `app/hooks/useEvidenceSearch.ts`, `app/hooks/useEvidenceScoring.ts`, `app/lib/stores/evidenceStore.ts`, `app/lib/types/evidence.ts`, `app/api/evidence-search/`.
- What shipped: inline `EvidenceQueryEditor`, sanitized `queries[]` API override, merge-on-rerun (existing papers win), per-paper lifecycle `status` (retrieved → evaluated → integrated-reserved; pruned), soft prune/restore, store `version: 1` migration.

The user framed these as **double-diamond / divergent-design** follow-ups — most are decisions, not just implementation. Don't jump straight to coding; route through the right workflow.

---

## 1. Incremental vs. deliberate re-scoring (cost) — highest-value, smallest

**Problem.** When a merge adds new unscored papers to an already-scored slot, `isSlotScored` flips to false, the button reverts to "Score papers", and clicking it sends *all* active papers (including already-`evaluated` ones) to `/api/evidence-score` — re-billing LLM tokens for papers that already have scores. The project is cost-sensitive (memory notes $0.40+ formalizations).

**Why deferred.** Not a bug (results are identical), and the naive fix ("only score `reliability === null`") would break the **intentional** "Re-score" action, which exists to re-evaluate everything. Distinguishing the two intents is a design decision.

**Where.** `app/hooks/useEvidenceScoring.ts` (`score` builds the payload from `activePapers`); the button label logic is in `app/components/features/evidence-search/EvidenceResultsSection.tsx` (`onScore`, gated on `isSlotScored`).

**Suggested approach.** Likely two affordances: an automatic/cheap "score new papers" (filter `reliability === null`) on the incremental path, and an explicit "Re-score all" that keeps current behavior. Could also dim/relabel based on whether unscored papers exist. Small RPI once the UX is decided.

## 2. Search history

**Problem.** Re-running replaces `slot.searchQueries` with the latest run's queries; there's no record of prior query sets or which query found which paper. User said history "seems like it would have value" but adds complexity not worth the first pass.

**Why deferred.** Scope + data-model growth (per-run records, per-paper provenance) for unclear payoff.

**Where.** `searchQueries` on `EvidenceSlot` (`app/lib/types/evidence.ts`); set in `mergeEvidence`/`setEvidence` (`app/lib/stores/evidenceStore.ts`); displayed by `EvidenceQueryEditor`.

**Suggested approach.** Double-diamond: is the valuable thing a query *history*, per-paper *provenance* ("found by query X"), or a *saved query sets* feature? These are different. Frame before building.

## 3. Cross-claim shared paper pool + per-(paper, claim) status view

**Problem.** Today each slot (= one claim) holds its own papers; the same paper relevant to several claims is duplicated across slots with independent status. The user confirmed per-(paper, claim) status is the right conceptual model but said "don't build it now — just design around that future interface."

**Why deferred.** Bigger data-model + UI change (a shared paper pool keyed by id, with status records per (paper, claim)).

**Where.** Status already lives on `EvidencePaper` within a slot, which *is* per-(paper, claim) — the type is intentionally shaped to migrate to a shared pool without a rewrite. See the `EvidencePaperStatus` JSDoc in `app/lib/types/evidence.ts`.

**Suggested approach.** Divergent-design on the storage shape (duplicate-with-sync vs. shared pool + status records) and the cross-claim UI (a single paper showing its verdict per claim). Touches `evidenceStore` structure most.

## 4. Artifact integration (the `integrated` status + citation insertion)

**Problem.** `integrated` is defined in the lifecycle but **unreachable** — there's no action to set it, because there is no artifact-text/citation-insertion mechanism yet. The user chose "reserve it, not reachable" for this iteration.

**Why deferred.** Needs a citation format + artifact-mutation wiring (a meaningfully larger surface).

**Where.** `EVIDENCE_PAPER_STATUSES` (`app/lib/types/evidence.ts`); no setter exists. Note `restorePaper` only restores to `evaluated`/`retrieved` (checks `reliability`), so if `integrated` ever becomes reachable, restore logic must be revisited so it doesn't silently downgrade an integrated paper.

**Suggested approach.** RPI once a citation/reference format is decided (where does the citation go — artifact text, a references list, both?). When integration becomes a real step, add the setter so `integrated` remains a *read-out* of that step, consistent with the lifecycle principle.

## 5. UX / a11y polish (small, batchable)

Surfaced by code review; none blocking.

- **Prune affordance discoverability** — the active-paper Prune control is a tiny `[10px]` low-contrast text button next to the status chip, no icon/tooltip. Consider an icon + tooltip. `EvidencePaperCard.tsx`.
- **Title in prune/restore aria-label** — in a list, screen readers announce just "Prune, button". `aria-label={`Prune "${paper.title}"`}` would disambiguate. `EvidencePaperCard.tsx`.
- **"No papers found" wording** when `active.length === 0` but pruned papers exist — slightly misleading (papers *were* found, then pruned). `EvidenceResultsSection.tsx`. (The query editor and "Show pruned" toggle still render, so it's only copy.)
- **Index keys in the query-editor rows** — `EvidenceQueryEditor.tsx` keys rows by array index; removing a middle row re-indexes. Controlled inputs keep values correct, but focus can jump. Switch to stable generated ids if the rows ever gain local state.
