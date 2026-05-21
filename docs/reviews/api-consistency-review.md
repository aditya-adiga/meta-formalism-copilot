# API Consistency Review — feat/evidence-scoring

**Scope:** `git diff main...HEAD` — new `/api/evidence-score` route, `adaptSchemaForAnthropic` export in `callLlm.ts`, `lib/types/evidence.ts` additions, `evidenceStore` actions, `useEvidenceScoring` hook.
**Date:** 2026-05-21
**Commit:** 0a96cce
**Based on:** code-fact-check report (`docs/reviews/code-fact-check-report.md`) — 8 verified incl. `validatePaperScore` null-on-missing-`openAlexId` contract and `MAX_PAPERS_PER_REQUEST=10`; Claim 8 fixed in review HEAD; Claim 1 (callLlm.ts) Mostly Accurate.

## Baseline Conventions

Surveyed the closest siblings: `/api/evidence-search` (the direct neighbor), the formalization routes via `app/lib/formalization/artifactRoute.ts`, the shared `fetchApi` helper (`app/lib/formalization/api.ts`), the `evidenceStore`, and `useEvidenceSearch`.

- **Route shape.** POST handlers parse `await request.json() as Partial<XRequest>`, validate fields manually, and return `NextResponse.json(...)`. Established by `evidence-search/route.ts:143-184` and `artifactRoute.ts:55-132`.
- **Error response shape.** Every route returns `{ error: string }` for client/server errors. `OpenRouterError` adds `{ error, details }` at status 502. Established in `evidence-search/route.ts:147-194` and `artifactRoute.ts:115-131`.
- **Status codes.** 400 for request validation; 502 for upstream LLM / invalid-LLM-JSON; 500 for unexpected. `evidence-search` uses 400/502/500; `artifactRoute` uses 400/502 (collapses unexpected into 502).
- **Response envelope.** Flat object keyed by domain noun, no wrapper. `evidence-search` → `{ queries, papers }`; formalization → `{ [responseKey]: parsed }` (`artifactRoute.ts:96-105`).
- **Field naming.** camelCase throughout request and response bodies: `elementContent`, `artifactType`, `elementId`, `contextSummary`, `openAlexId`, `oaUrl`, `searchedAt`. No snake_case anywhere in the JS-facing contract.
- **Mock fallback.** Routes degrade silently when no key is present. `evidence-search` falls back to a query without a flag; the Lean verifier returns `{ valid, mock: true }` (per repo CLAUDE.md). There is **no** existing route that returns `mock: true` in its typed JSON response body — `mock` is a documented out-of-band debug flag, not part of any `XResponse` type.
- **Store actions.** `evidenceStore` actions are `setEvidence`, `setLoading`, `setError`, `clearEvidence`, `clearAll` — `set<Noun>` / `clear<Noun>` verb-noun shape; per-element maps keyed by `serializeTargetKey`.
- **Hooks.** `useEvidenceSearch` returns `{ slot, isLoading, error, <action> }`, reads state via `useShallow`, and writes through `useEvidenceStore.getState()` inside a `useCallback`.
- **`callLlm` public surface.** Exports are configuration/primitive-level: `OPENROUTER_API_URL`, `DEFAULT_ANTHROPIC_MODEL`, `makeAnthropicClient`, `OpenRouterError`, `LlmCallUsage`, `ResponseFormat`, `CacheKey`, `callLlm`. No exported pure schema-transform helpers existed before this diff.

## Name-Pattern Audit

| New name | Category | Closest existing | Precedent path | Verdict |
|----------|----------|------------------|----------------|---------|
| `POST /api/evidence-score` | route | `POST /api/evidence-search`, `POST /api/custom-type/design`, `POST /api/decomposition/extract` | `app/api/evidence-search/route.ts`, `app/api/**/route.ts` | Consistent — `evidence-<verb>` hyphenated noun-verb, matches `evidence-search` exactly |
| `EvidenceScoreRequest` / `EvidenceScoreResponse` | type | `EvidenceSearchRequest`, `EvidenceSearchResponse` | `app/lib/types/evidence.ts:116-148` | Consistent — `Evidence<Op>Request/Response` mirror of the search pair |
| `PaperScore` | type | `EvidencePaper`, `EvidenceSlot` | `app/lib/types/evidence.ts` | Consistent — bare-noun, no DTO/I prefix |
| `ReliabilityScore`, `RelatednessScore` | type | `EvidencePaper`, `EvidenceSlot` | `app/lib/types/evidence.ts` | Consistent — bare-noun PascalCase |
| `StudyType` / `STUDY_TYPES` / `STUDY_TYPE_LABELS` | type/const | `EvidenceArtifactType` / `EVIDENCE_ARTIFACT_TYPES` | `app/lib/types/evidence.ts` | Consistent — `as const` array + derived union; SCREAMING_SNAKE const matches `EVIDENCE_ARTIFACT_TYPES` |
| `claimContent` (request field) | field | `elementContent` (evidence-search request) | `app/api/evidence-search/route.ts:147`, `app/lib/types/evidence.ts` | Inconsistent (Minor) — sibling search route names the same logical input `elementContent`; see Finding 2 |
| `setScoring` | store action | `setLoading`, `setEvidence`, `setError` | `app/lib/stores/evidenceStore.ts:99-114` | Consistent — `set<Noun>` shape |
| `applyScores` | store action | `setEvidence`, `clearEvidence`, `setLoading` | `app/lib/stores/evidenceStore.ts:65-68` | Inconsistent (Minor) — only action with an `apply*` verb; see Finding 3 |
| `scored` / `scoredAt` (slot fields) | field | `searchedAt`, `searchQueries` (slot) | `app/lib/types/evidence.ts:107-113` | Consistent — `<verb>edAt` ISO-string timestamp matches `searchedAt` |
| `useEvidenceScoring` | hook | `useEvidenceSearch` | `app/hooks/useEvidenceSearch.ts` | Consistent — `useEvidence<Op>`; returns `{ slot, isScoring, error, score, hasScores }` paralleling search hook |
| `adaptSchemaForAnthropic` | exported function | `makeAnthropicClient` (only other exported fn) | `app/lib/llm/callLlm.ts:14,66` | See Finding 4 — surface placement, not naming, is the question |
| `mock` (response field) | field | _(no typed response carries a `mock` field)_ | none — searched `app/lib/types/evidence.ts`, all `XResponse` types in `app/api/**` and `app/lib/types/**` | New field on a typed response; see Finding 1 |

## Findings

#### `mock: true` is added to the response body via an inline intersection, not the `EvidenceScoreResponse` contract

**Severity:** Minor
**Location:** `app/api/evidence-score/route.ts:200-214`
**Move:** #1 (baseline) / #7 (asymmetry)
**Confidence:** High

When `callLlm` returns no text (no key configured), the route returns `{ scores, mock: true } satisfies EvidenceScoreResponse & { mock: boolean }`. The success path returns `EvidenceScoreResponse` (`{ scores }`) with no `mock` key. So the route's actual response shape is a union that the published `EvidenceScoreResponse` type does not describe — a consumer typing the result as `EvidenceScoreResponse` (as `useEvidenceScoring` does via `fetchApi<EvidenceScoreResponse>`) can never observe the `mock` flag and silently treats neutral 0.5 placeholder scores as real LLM scores. This mirrors the known silent-pass concern with the Lean verifier mock (repo CLAUDE.md). No existing typed `XResponse` carries a `mock` field, so this is a new convention being introduced ad hoc rather than an inconsistency with an established one. The asymmetry (success vs. mock branch return different shapes) is the consumer-facing risk: `hasScores`/`scored` will read true off mock data.

**Recommendation:** Either add `mock?: boolean` to `EvidenceScoreResponse` so the contract is honest and `useEvidenceScoring` can branch on it (e.g., not mark the slot `scored` when `mock`), or drop the flag and document the mock branch as indistinguishable. Prefer the former for parity with the verifier's explicit `unavailable`/`mock` handling.

#### Request field `claimContent` diverges from the sibling route's `elementContent` for the same logical input

**Severity:** Minor
**Location:** `app/api/evidence-score/route.ts:96-117`, `app/lib/types/evidence.ts:130-135`
**Move:** #2 (naming) / #7 (asymmetry)
**Confidence:** Medium

Precedent: `elementContent` used in `app/api/evidence-search/route.ts:147-158` and `EvidenceSearchRequest` in `app/lib/types/evidence.ts`.

The two evidence routes are a search/score pair operating on the same artifact element. `evidence-search` names the text input `elementContent`; `evidence-score` names the equivalent input `claimContent`. A consumer wiring both routes for one element must remember that the same string is `elementContent` in one body and `claimContent` in the other. The `useEvidenceScoring` hook passes the caller's `claimContent` argument straight through, so the divergence propagates to the hook surface too. The choice is defensible — "claim" is arguably more precise for scoring against a proposition — but it is an inconsistency with the immediately adjacent route. The `MAX_CLAIM_LENGTH = 5000` / `MAX_ELEMENT_CONTENT_LENGTH = 5000` constant pair shows the same logical field renamed across the two files.

**Recommendation:** Pick one name for the element/claim text across both evidence routes (lowest-churn: rename to `elementContent` to match the existing search contract), or add a one-line comment in `EvidenceScoreRequest` noting the deliberate rename so future readers don't treat it as a bug.

#### `applyScores` is the only store action using an `apply*` verb instead of `set*`/`clear*`

**Severity:** Minor
**Location:** `app/lib/stores/evidenceStore.ts:67-68, 117-143`
**Move:** #2 (naming)
**Confidence:** Medium

Precedent: `setEvidence`, `setLoading`, `setScoring`, `setError`, `clearEvidence`, `clearAll` used in `app/lib/stores/evidenceStore.ts:65-118`.

Every other action in this store (and the diff's own `setScoring`) follows `set<Noun>` / `clear<Noun>`. `applyScores` introduces a third verb. The behavior justifies a distinct verb somewhat — it merges scores into existing papers and recomputes `scored`/`scoredAt` rather than replacing a value — so this is a borderline call, not a clear violation. But a consumer scanning the action list will not predict `applyScores` from the established vocabulary, and `setScores` would have read as a plain setter which it is not.

**Recommendation:** Acceptable to keep given the merge semantics, but consider `mergeScores` or document the non-setter behavior in the action's JSDoc so the verb choice is legibly intentional rather than accidental.

#### `adaptSchemaForAnthropic` is exported from `callLlm.ts`; confirm it belongs on the public surface

**Severity:** Informational
**Location:** `app/lib/llm/callLlm.ts:66-78`
**Move:** #1 (baseline) / #3 (consumer contract)
**Confidence:** Medium

The new `export function adaptSchemaForAnthropic` is a pure schema-transform used in exactly one place — inside `callLlm` itself (`callLlm.ts:171-179`). The existing exports from this module are either runtime configuration (`OPENROUTER_API_URL`, `DEFAULT_ANTHROPIC_MODEL`), a factory (`makeAnthropicClient`), an error class, types, or the primary `callLlm` entry point — none are internal pre-processing helpers. Exporting `adaptSchemaForAnthropic` widens the module's public contract: any future change to which JSON-Schema keywords Anthropic rejects (the `ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS` set) is now a potential breaking change for out-of-module callers. Grepping the diff, the only consumer is the route's reliance on `callLlm` doing the stripping internally; nothing imports `adaptSchemaForAnthropic` directly. If the export exists solely for unit testing, that is a reasonable motive but should be explicit. This is not a naming finding (the name itself, `adapt<X>ForAnthropic`, is clear and parallels `makeAnthropicClient`'s Anthropic-scoping); it is a surface-breadth observation.

**Recommendation:** If the export is only for tests, keep it but add a `/** Exported for unit testing; not part of the stable call-layer API. */` note, or test the behavior through `callLlm`. If it is intended for reuse by other routes, leave exported as-is — the name and signature are fine.

## What Looks Good

- **Route/type/hook naming is otherwise a clean mirror of the search pair.** `evidence-score` ↔ `evidence-search`, `EvidenceScoreRequest/Response` ↔ `EvidenceSearchRequest/Response`, `useEvidenceScoring` ↔ `useEvidenceSearch`. A consumer who learned the search side will navigate the score side with no surprises.
- **Error format matches the baseline exactly.** 400 for validation (`route.ts:99-117`), 502 with `{ error, details }` for `OpenRouterError`, 500 with `{ error }` for unexpected — identical to `evidence-search/route.ts:185-195`. `fetchApi` reads `data.error`, so the hook surfaces messages correctly.
- **Response envelope is flat and noun-keyed** (`{ scores }`), consistent with `{ queries, papers }`.
- **`STUDY_TYPES` follows the `as const` + derived-union + SCREAMING_SNAKE pattern** already used by `EVIDENCE_ARTIFACT_TYPES`, including a paired `STUDY_TYPE_LABELS` record.
- **`scored`/`scoredAt` parallels `searchedAt`** and the slot type evolution (replacing the reserved `reliability`/`relatedness` number fields with per-paper scores) is internally consistent — the per-paper `ReliabilityScore`/`RelatednessScore` move the scoring granularity to where the data lives.
- **Backward-compatible additions.** New optional/nullable fields (`reliability: ReliabilityScore | null`, `relatedness: ... | null` on `EvidencePaper`), a new route, and a new store action — no removed response fields or new required request params on existing surfaces. The `EvidenceSlot` field change (number → struct) is a persisted-shape change but is gated by the `evidence-store-v1` persist key and is internal to this feature.
- **`setScoring` correctly mirrors `setLoading`** including the per-element keyed map and the `clearAll` reset (`evidenceStore.ts:153`), and the hook guards against concurrent scoring via a `getState().scoring[key]` check (`useEvidenceScoring.ts:38`).
- **`validatePaperScore` null-on-missing-`openAlexId` contract** (fact-check verified) and server-side `clampScore` enforcement of the 0–1 range are a sound defensive boundary given the schema can't express `minimum`/`maximum`.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | `mock: true` not in `EvidenceScoreResponse` contract; success/mock shape asymmetry | Minor | `evidence-score/route.ts:200-214` | High |
| 2 | `claimContent` vs sibling `elementContent` for same input | Minor | `evidence-score/route.ts:96-117` | Medium |
| 3 | `applyScores` is the lone `apply*` action vs `set*`/`clear*` | Minor | `evidenceStore.ts:67-68,117-143` | Medium |
| 4 | `adaptSchemaForAnthropic` exported, single in-module caller | Informational | `callLlm.ts:66-78` | Medium |

## Overall Assessment

This change is broadly consistent with the codebase's API patterns — the strongest signal being that `evidence-score` is a near-exact structural mirror of `evidence-search` across route path, request/response types, error format, status codes, store wiring, and hook shape, which is exactly what a consumer who already learned the search side expects. No breaking changes to existing consumers: all additions are new surfaces or new optional/nullable fields. The findings are all Minor or Informational and fixable in place; none indicate the author failed to read existing conventions. The one with real consumer-impact teeth is Finding 1 — the `mock: true` flag living outside the typed contract means placeholder 0.5 scores can be silently mistaken for real assessments (and marked `scored`), echoing the known Lean-verifier silent-pass pattern; surfacing `mock` in the type and having the hook decline to mark the slot scored would close that gap. The `claimContent`/`elementContent` split (Finding 2) is the kind of small cross-route inconsistency that accumulates cognitive load and is cheap to resolve now.

## Goal-Alignment Note
- Answered: yes — API-consistency review of all five named surfaces against siblings, report saved per skill structure.
- Out of scope: behavioral correctness of the LLM scoring prompt, security (key handling/injection), performance, and UI components (`EvidencePaperCard`, `EvidenceScoreBadge`, etc.) — left to their respective critics.
- Escalate: Finding 1 (mock flag outside the typed contract → silent-pass risk) is the only finding with a behavioral/data-integrity dimension worth the orchestrator weighing against security/architecture critics' input on the mock-fallback pattern.
- Questions I would have asked: omitted — scope was clear.
