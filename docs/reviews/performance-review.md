# Performance Review — feat/evidence-scoring

**Commit:** 0a96cce
**Scope:** `git diff main...HEAD` — evidence reliability/relatedness scoring (route, hook, store, types, UI, callLlm schema adaptation)
**Date:** 2026-05-21
**Based on:** `docs/reviews/code-fact-check-report.md` (Claim 8 fixed in 0a96cce; MAX_PAPERS_PER_REQUEST=10, 300ms debounce, "scored only if every paper scored" invariant all verified)

> Note on baselines: No profiler runs, load tests, or production dashboards were surfaced for any path in this diff, and none are documented in the repo. Per the skill's Baseline Requirement, every finding below is therefore flagged speculative. The app is also a single-tenant self-hosted deploy (one user per deployment, per `CLAUDE.md`), which caps realistic concurrency at ~1 active user — this materially lowers the severity ceiling for contention/throughput concerns.

## Data Flow and Hot Paths

The scoring feature adds one user-initiated path:

1. User clicks "Score papers" in `EvidenceResultsSection` → `useEvidenceScoring.score(claimContent)`.
2. The hook reads the slot's papers (capped at 8 — search uses `MAX_RESULTS = 8` in `evidence-search/route.ts:181`), POSTs them to `/api/evidence-score`.
3. The route builds a single prompt covering all papers and makes **one** `callLlm` call (Sonnet, `maxTokens: 4096`), parses/validates the JSON, returns scores.
4. `applyScores` merges scores into the slot via a `Map` lookup; Zustand persists the slot to localStorage through the shared 300ms-debounced adapter.
5. `EvidenceResultsSection` re-sorts papers by combined score for display.

**Path temperature:** Cold-to-warm, not hot. Scoring is explicitly user-gated (one click), runs at most once per slot per click, and operates on ≤8 items. There is no per-request server loop, no background worker, and no high-frequency callback. The dominant cost is the single LLM round-trip (network + token latency), which is inherent to the feature, not an algorithmic defect. This framing caps most findings at Low/Informational.

## Findings

#### Cache key omits `responseFormat`/schema — latent collision risk if a prompt is reused with a different schema

**Severity:** Low
**Location:** `app/lib/llm/callLlm.ts:151-152` (key built from `model, systemPrompt, userContent, maxTokens`); `app/lib/llm/cache.ts:17-27` (`computeHash`)
**Move:** Question the cache (invalidation / correctness of the key)
**Confidence:** High
**Baseline:** no baseline available — flagged as speculative

`computeHash` derives the cache key from `(model, systemPrompt, userContent, maxTokens)` only; `responseFormat` is not part of the key. For the evidence-score route specifically this is **benign**: the schema (`SCORING_SCHEMA`) is a static constant always paired with the same `SCORING_SYSTEM_PROMPT`, so identical prompt+content always implies identical schema — no collision is reachable today. The risk is latent: if any future endpoint issues two `callLlm` calls with the same model/system/user/maxTokens but different `responseFormat` (e.g. schema vs. no-schema, or schema A vs. schema B), the second call would silently return the first call's cached text, which may not satisfy the second caller's schema expectations. This is a correctness-shaped cache bug, not a throughput problem, and it does not manifest in this PR.

**Recommendation:** Fold a stable digest of `responseFormat` (e.g. `JSON.stringify(responseFormat?.json_schema?.schema ?? null)`) into `computeHash`'s hashed object. Cheap (one hash input), and it removes the footgun before a future endpoint hits it. Not a merge blocker for this PR.

#### `adaptSchemaForAnthropic` recursively rebuilds the schema on every Anthropic call

**Severity:** Low
**Location:** `app/lib/llm/callLlm.ts:66-77`, invoked at `:177-179`
**Move:** Find the work that moved to the wrong place / hidden multiplication
**Confidence:** High
**Baseline:** no baseline available — flagged as speculative

`adaptSchemaForAnthropic` walks the entire schema object tree and allocates a fresh object/array at every node, on every Anthropic `callLlm` invocation that passes a `responseFormat`. The schemas in play are tiny and fixed at module load (the evidence schema is ~6 nested objects), and the work runs exactly once per LLM call — which is itself gated behind a multi-hundred-millisecond network round-trip. The transform cost is negligible against the LLM latency it precedes (microseconds vs. hundreds of ms). It is only worth noting because the function is positioned to be called by *every* schema-using endpoint, not just scoring. The allocation is genuinely per-call rather than per-item, so there is no multiplication against N.

**Recommendation:** No action required at current scale. If the number of schema-using endpoints or call frequency grows substantially, memoize the adapted schema by source-schema identity (e.g. a `WeakMap<object, unknown>` keyed on `responseFormat.json_schema.schema`) so each static schema is transformed once. Premature today.

#### `sortByScore` clones-and-sorts on every render where the memo input changes

**Severity:** Informational
**Location:** `app/components/features/evidence-search/EvidenceResultsSection.tsx:5-12`, `:48-51`
**Move:** Ask "what's the size of N?" / asymptotic behavior
**Confidence:** High
**Baseline:** no baseline available — flagged as speculative

`sortByScore` does `[...papers].sort(...)`, an O(n log n) copy-and-sort. It is wrapped in `useMemo` keyed on `[slot.papers, slot.scored]`, so it only recomputes when the papers array reference or `scored` flag changes — not on unrelated re-renders. N is bounded at 8 (search cap). 8 log 8 with a one-element clone is trivial and runs only on display update, not in any server or per-item path. No concern; noted only to confirm the memo guard is correct and N is hard-bounded upstream.

**Recommendation:** None. The `useMemo` dependency array is correct and N is capped at 8.

#### Store update patterns allocate new top-level maps per action — idiomatic and bounded

**Severity:** Informational
**Location:** `app/lib/stores/evidenceStore.ts:99-145` (`setScoring`, `applyScores`)
**Move:** Trace the memory lifecycle / re-render triggers
**Confidence:** High
**Baseline:** no baseline available — flagged as speculative

`setScoring` and `applyScores` follow Zustand's standard immutable-update pattern (spread the changed sub-map, build a new object). `applyScores` builds a `Map` from the score array (O(papers)) then maps over slot papers (O(papers)) — both O(8). The hook subscribes via `useShallow` selecting `{slot, isScoring, error}`, so a `setScoring` toggle re-renders only the subscribed components, and the shallow compare prevents re-render churn from unrelated slot keys. No unbounded growth: `scoring`/`errors`/`slots` maps are keyed by a finite set of artifact-element keys, and `clearAll` resets `scoring` (correctly added at `:153`). Persistence rides the existing 300ms-debounced adapter, so a re-score does not trigger a synchronous localStorage write storm.

**Recommendation:** None. This matches the established store conventions.

#### Scoring path has no N+1 and no repeated work — single batched LLM call

**Severity:** Informational
**Location:** `app/api/evidence-score/route.ts:147-159`; `app/hooks/useEvidenceScoring.ts:33-66`
**Move:** Count the hidden multiplications / database (here, LLM) interaction pattern
**Confidence:** High
**Baseline:** no baseline available — flagged as speculative

The classic failure mode here would be one LLM call per paper (N+1 against the model). The implementation correctly batches: all ≤8 papers go into one prompt and one `callLlm` call. Paper summaries are built once (`map` over ≤8 items, abstracts truncated to 500 chars — a sensible token-cost guard), the claim is capped at `MAX_CLAIM_LENGTH = 5000`. The hook guards against double-submit (`if (scoring[key]) return`) so a double-click cannot fire two concurrent calls. Validation loops (`validatePaperScore` per score) are O(8). There is no repeated serialization, no per-item network call, and no transaction held across I/O. The unused 10-vs-8 headroom (route accepts 10, search only ever produces 8) is harmless slack, not a bug.

**Recommendation:** None. The batching is the right shape. If `MAX_RESULTS` is ever raised well above 10, revisit `maxTokens: 4096` — a larger paper set could truncate the JSON response and trip the `validatePaperScore` drop path (a correctness/cost concern, not a perf one).

## What Looks Good

- **Single batched LLM call** over all papers — the most important perf decision in the feature, and it's correct (no N+1).
- **`useMemo` on the sort** with a correct dependency array; N hard-capped at 8 upstream.
- **`useShallow` selector** in the hook scopes re-renders to the subscribed slice.
- **Double-submit guard** in `useEvidenceScoring` prevents redundant concurrent LLM spend.
- **Abstract truncation (500 chars) and claim cap (5000 chars)** bound the input token cost per call.
- **`adaptSchemaForAnthropic` returns a new object** rather than mutating the shared module-level schema constant — avoids a subtle cross-call corruption bug.
- **Debounced persistence** reused from the existing adapter; no new write-amplification.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Cache key omits `responseFormat`/schema (latent, benign here) | Low | `callLlm.ts:151-152` | High |
| 2 | `adaptSchemaForAnthropic` rebuilds schema per call | Low | `callLlm.ts:66-77` | High |
| 3 | `sortByScore` clone-and-sort (memoized, N≤8) | Informational | `EvidenceResultsSection.tsx:5-12` | High |
| 4 | Store update / re-render pattern (idiomatic, bounded) | Informational | `evidenceStore.ts:99-145` | High |
| 5 | No N+1; single batched LLM call | Informational | `evidence-score/route.ts:147-159` | High |

## Overall Assessment

The performance posture of this change is healthy. The one architecturally significant decision — batching all papers into a single LLM call rather than scoring per-paper — is made correctly, and the surrounding code (memoized sort over a hard-capped N≤8, shallow-selected store subscriptions, debounced persistence, double-submit guard) follows the codebase's established patterns without introducing unbounded growth or hot-path multiplication. There are no Critical, High, or Medium findings. The only item worth a follow-up is the cache-key composition (finding 1): it omits `responseFormat`, which is harmless for this PR because the schema is statically bound to the prompt, but is a latent footgun for any future endpoint that reuses a prompt+content pair with two different schemas — fix it cheaply by hashing the schema into the key when convenient, not as a merge blocker. No profiling or benchmarking is required to ship this; the dominant cost is the inherent LLM round-trip, which no code change here can avoid.

## Goal-Alignment Note
- Answered: yes — full perf review of the scoring diff, all scope items addressed
- Out of scope: correctness/security of `validatePaperScore`, the Lean-verifier silent-pass, and `maxTokens` truncation behavior (a correctness concern, flagged only in passing) — set aside as non-performance concerns
- Escalate: cache-key omission of `responseFormat` is benign in this PR but a latent cross-endpoint footgun; orchestrator may want to track it as a standalone hardening item for `callLlm.ts` rather than a blocker here
- Questions I would have asked: omitted — scope was unambiguous
