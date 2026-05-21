# Architecture Review — feat/evidence-scoring

**Commit:** 0a96cce
**Scope:** `git diff main...HEAD` — evidence-paper LLM scoring feature
**Date:** 2026-05-21
**Based on:** `docs/reviews/code-fact-check-report.md` (8 verified, Claim 8 fixed in 0a96cce, Claim 1 on callLlm mostly accurate)

> **Trust-Boundary Cross-Reference:** No-op. The skill's activation glob is
> `docs/reviews/security-review-*.md`; the only security artifact present is
> `docs/reviews/security-review.md`, and its Trust Boundary Map is scoped to a
> different branch (`feat/custom-artifact-types`) and a different data path
> (user-authored system prompts via `/api/custom-type/*`). It does not cover the
> evidence-score data path. No labeled trust boundary applies to this diff, so
> module-boundary findings below proceed without cross-reference. Flagged for the
> orchestrator in case a fresh security pass on this branch is expected.

## Dependency Map

The feature adds one new vertical slice and one cross-cutting change. Dependency
direction is clean throughout — everything points toward the stable type module.

```
EvidencePaperCard / EvidenceResultsSection (UI, volatile)
        │  imports types + EvidenceScoreBadge
        ▼
FindEvidenceButton ──► useEvidenceScoring (hook) ──► evidenceStore (state)
                              │                            │
                              │ fetchApi                   │ imports PaperScore
                              ▼                            ▼
                    /api/evidence-score/route.ts ──► lib/types/evidence.ts (stable core)
                              │                            ▲
                              │ imports                    │
                              ▼                            │
                    scoreValidation.ts ──────────────► (STUDY_TYPES, PaperScore, StudyType)
                              │
                              ▼
                    lib/llm/callLlm.ts (cross-cutting LLM infra)
```

All modules depend inward on `lib/types/evidence.ts`, which depends on nothing in
the feature. The route depends on shared infra (`callLlm`, `stripCodeFences`,
`models`) rather than reimplementing it. `adaptSchemaForAnthropic` sits at the
provider-adaptation seam inside `callLlm`. No circular dependencies, no
core→detail inversions, no layer violations introduced. The structural shape
mirrors the existing `evidence-search` slice almost exactly, which is the right
prior art to follow.

## Findings

#### 1. Search and scoring share one `errors[key]`/`loading[key]` namespace with no concern discrimination

**Severity:** Coupling
**Location:** `app/lib/stores/evidenceStore.ts:54-66,99-114`; `app/hooks/useEvidenceScoring.ts:31-37`; `app/hooks/useEvidenceSearch.ts:24-30`; `app/components/features/evidence-search/FindEvidenceButton.tsx:22-23,40`
**Move:** #7 Measure the coupling surface
**Confidence:** High

The store added a dedicated `scoring` map (good — scoring loading state is
distinct from `loading`), but error reporting was *not* given the same
treatment. Both `useEvidenceSearch` and `useEvidenceScoring` write to and read
from the single `errors[key]` slot via `setError(key, …)`. `FindEvidenceButton`
renders `error` destructured from `useEvidenceSearch` only, yet a scoring failure
set by `useEvidenceScoring` lands in the same slot and surfaces correctly *by
accident* — both hooks alias the same store entry under the same composite key.
This works today but is fragile: a search that succeeds after a prior scoring
error won't clear the scoring error (search's `setError(key, null)` runs on the
next search, but the two flows are now temporally coupled through shared state),
and a future reader cannot tell from the rendered error whether search or scoring
failed. The asymmetry (separate `scoring` loading, shared `errors`) is itself a
smell — the two booleans were split but the error channel wasn't.

**Recommendation:** Either commit to the shared-error model deliberately
(document that `errors[key]` is "last operation on this slot, search or scoring"
and have `FindEvidenceButton` read it once, not via the search hook) or split it
into `searchErrors`/`scoringErrors` to mirror the `loading`/`scoring` split.
Prefer the latter for symmetry with the loading state you already separated.

#### 2. `scored` slot flag and per-paper `reliability !== null` encode the same fact in two places

**Severity:** Coupling
**Location:** `app/lib/stores/evidenceStore.ts:114-143` (`applyScores`); `app/lib/types/evidence.ts:110-114`; `app/components/features/evidence-search/EvidencePaperCard.tsx:26`; `EvidenceResultsSection.tsx:60-63`
**Move:** #2 Assess responsibility boundaries / #3 Module boundary
**Confidence:** Medium

`applyScores` derives `slot.scored = updatedPapers.every(p => p.reliability !== null)`
and persists it alongside the per-paper `reliability`/`relatedness` fields. The
"is this scored?" fact now lives in two representations: the aggregate
`slot.scored` boolean and the per-paper nullability. `EvidenceResultsSection`
gates sorting on `slot.scored`, while `EvidencePaperCard` independently checks
`paper.reliability !== null`. Because both are persisted to localStorage, they can
drift — e.g. a future partial re-score, a migration, or hand-edited storage could
leave `scored: true` with some papers null, or vice versa. Derived state that is
also persisted is a classic source of invariant violations.

**Recommendation:** Treat `scored` as derived, not stored — compute it from the
papers at read time (a selector/getter), or document the invariant that
`scored === papers.every(p => p.reliability !== null)` and centralize its
enforcement in `applyScores` only. Given the persist middleware, the safest move
is to derive it and drop it from the persisted shape.

#### 3. `adaptSchemaForAnthropic` is placed correctly, but the keyword-strip approach silently degrades the contract rather than translating it

**Severity:** Minor
**Location:** `app/lib/llm/callLlm.ts:49-77,170-182`
**Move:** #3 Audit the module boundary / #8 Evaluate extension points
**Confidence:** Medium

Placement is right: the OpenRouter↔Anthropic schema-dialect mismatch is a
provider-adaptation concern and belongs inside `callLlm`, the single seam where
provider dispatch happens. Exporting `adaptSchemaForAnthropic` for unit testing
is reasonable. The structural concern is the *mechanism*: it strips
`minimum`/`maximum`/etc. so the schema is *accepted*, but the constraint those
keywords expressed (score ∈ [0,1]) is now enforced only by `clampScore`
server-side, in a different module (`scoreValidation.ts`). The schema and its
runtime guarantee are split across two files with only a comment linking them.
This is acceptable today (the set is small and documented), but the
deny-list-of-keywords pattern will grow brittle: every new schema using a
stripped keyword inherits an invisible "you must also clamp this yourself"
obligation that the type system does not express. As more endpoints adopt
structured output, this becomes a cross-cutting trap.

**Recommendation:** Keep the placement. Consider, when a second consumer appears,
elevating this from "strip and hope the caller clamps" to a documented
provider-capability adapter with a companion runtime-validation contract (e.g. a
helper that pairs a schema with its clamps). No change required for this PR; flag
as the structural direction to watch.

#### 4. `EvidenceScoreResponse & { mock: boolean }` ad-hoc intersection diverges the response contract from its named type

**Severity:** Minor
**Location:** `app/api/evidence-score/route.ts:178-179`; `app/lib/types/evidence.ts:144-147`
**Move:** #3 Audit the module boundary
**Confidence:** Medium

The mock-fallback branch returns `{ scores, mock: true } satisfies
EvidenceScoreResponse & { mock: boolean }`, but the success branch returns a plain
`EvidenceScoreResponse` with no `mock` field, and the consumer
(`useEvidenceScoring`) types the response as `EvidenceScoreResponse` and never
reads `mock`. The `mock` field is a real part of the wire contract that exists
nowhere in the named type. A consumer wanting to badge mock results (as the
search side may eventually) has no typed way to discover it.

**Recommendation:** Add an optional `mock?: boolean` to `EvidenceScoreResponse`
(consistent with how `EvidenceSearchResponse` would carry such a flag) so the
contract is expressed in one place rather than inlined at the call site.

#### 5. `EvidenceScoreRequest.papers` uses `Pick<EvidencePaper, …>`, coupling the request DTO to the storage model

**Severity:** Informational
**Location:** `app/lib/types/evidence.ts:130-134`
**Move:** #7 Measure the coupling surface
**Confidence:** Medium

The scoring request's `papers` field is `Pick<EvidencePaper, "openAlexId" |
"title" | "authors" | "year" | "abstract" | "journal">`. This is convenient and
DRY, but it couples the API request shape to the internal `EvidencePaper` storage
type: if `EvidencePaper` renames or retypes one of those fields (e.g. `authors`
shape changes), the request contract silently changes with it. For an internal
single-app API this is a reasonable tradeoff and consistent with the codebase's
style, but note that the request DTO and the storage model are now structurally
welded. The route validates only `openAlexId` and `title` at runtime, so the
`Pick` is also stricter than the actual validation.

**Recommendation:** Acceptable as-is for an internal API. If this endpoint is ever
exposed to external callers or the storage model churns, define an explicit
`ScoreablePaper` DTO instead of `Pick`-ing from storage.

## What Looks Good

- **The new slice mirrors `evidence-search` precisely** — `route.ts` +
  extracted testable helper (`scoreValidation.ts` ↔ `openAlexUtils.ts`), a hook
  (`useEvidenceScoring` ↔ `useEvidenceSearch`) with identical `useShallow`/
  `getState()` patterns, and store actions following the existing convention. The
  feature reuses `callLlm`, `stripCodeFences`, `CLAUDE_SONNET`, and `fetchApi`
  rather than duplicating LLM/transport infrastructure. This is textbook
  "extend by following the established pattern."
- **`scoreValidation.ts` extraction** keeps validation/normalization out of the
  route handler and independently unit-testable — correct responsibility split.
- **`adaptSchemaForAnthropic` placement** at the provider-dispatch seam is the
  right layer for the dialect-mismatch concern; it is pure, non-mutating, and
  recursive (confirmed by fact-check), and the `responseFormat` doc comment was
  updated to reflect the new dual-provider behavior.
- **Dedicated `scoring` loading map** correctly separates scoring's in-flight
  state from search's `loading`, and the concurrent-call guard in
  `useEvidenceScoring` reads live `getState()` rather than the closed-over
  snapshot.
- **Type migration** from slot-level `reliability/relatedness: number | null` to
  per-paper `ReliabilityScore | RelatednessScore` objects is a clean data-model
  evolution; the stale "Phase 2 reserved" comments were updated in the same diff.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Search/scoring share one `errors[key]` slot; loading was split but errors weren't | Coupling | `evidenceStore.ts:99-114`, `useEvidenceScoring.ts:31` | High |
| 2 | `slot.scored` duplicates per-paper `reliability !== null`; both persisted, can drift | Coupling | `evidenceStore.ts:114-143`, `evidence.ts:110-114` | Medium |
| 3 | Schema-keyword strip degrades [0,1] contract to a comment-linked runtime clamp | Minor | `callLlm.ts:49-77,170-182` | Medium |
| 4 | `mock` field absent from named `EvidenceScoreResponse` type | Minor | `route.ts:178`, `evidence.ts:144` | Medium |
| 5 | Request DTO `Pick`s from storage model, welding the two contracts | Informational | `evidence.ts:130-134` | Medium |

## Overall Assessment

This change **maintains and slightly improves** the system's structural integrity.
Dependency direction is correct, there are no layer violations or circular
dependencies, and the feature was built by faithfully replicating the existing
`evidence-search` slice rather than inventing a parallel structure or duplicating
LLM infrastructure — the single most important architectural question ("does
scoring reuse search/formalization infra or duplicate it?") resolves cleanly to
*reuse*. The `adaptSchemaForAnthropic` cross-cutting addition is at the correct
layer. All five findings are fixable in place; none indicate a need for
restructuring. The single most important concern is **Finding 1**: the
asymmetric split of loading vs. error state across the shared `errors[key]`
namespace is the one place where the otherwise-consistent search/scoring symmetry
breaks, and it currently works only because the two hooks alias the same store
slot under the same key — a coincidence worth converting into an intentional,
documented decision before more operations land on the slot.

## Goal-Alignment Note
- Answered: yes — module boundaries, dependency direction, `adaptSchemaForAnthropic` placement, and the schema-dialect layering all assessed.
- Out of scope: prompt-injection / token-budget / input-validation depth (security-reviewer's domain); the OpenRouter-vs-Anthropic dispatch correctness (verified by fact-check, not re-checked).
- Escalate: the security artifact present (`security-review.md`) is for a different branch — if a security pass on `feat/evidence-scoring` is expected, the orchestrator should run one; the Trust-Boundary cross-reference was a no-op here.
