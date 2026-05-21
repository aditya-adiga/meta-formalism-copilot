# Tech Debt Triage — feat/evidence-scoring

**Commit:** 0a96cce
**Scope:** `git diff main...HEAD` — 14 files, +851/-42. LLM evidence-paper scoring across route + hook + store + types + UI, plus a shared `callLlm.ts` schema-adaptation helper.
**Mode:** Advisory / contextual critic in a code-review pipeline. Findings tagged with a **Legibility-target** (`for-author` default).

This is a clean, well-commented feature. The debt below is minor and mostly latent — none of it blocks the PR. The triage exists to make the carry/fix tradeoff explicit so the author can decide what (if anything) to address before merge.

---

## Triage Summary

| # | Debt Item | Carrying Cost | Cost of Deferral | Failure Cost | Fix Cost | Urgency | Recommendation |
|---|-----------|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `responseFormat` absent from `callLlm` cache key | Low | +0 (inert today) | Low × Med — silent wrong-shape cache hit if two endpoints ever share model+prompts+maxTokens | Hours | Latent | Defer and monitor |
| 2 | Shared `errors[key]` map collides between search and scoring hooks | Medium | +0 (inert) | | Hours | None | Fix opportunistically |
| 3 | Schema-dialect coupling: source schemas carry OpenRouter-shaped keywords, stripped per-provider | Low | +1 stripped keyword per schema feature adopted | | Hours→Days | Latent | Carry intentionally |
| 4 | Route-level duplication vs sibling `evidence-search/route.ts` (validation, prompt+schema colocation, catch block) | Low | +~30 dup lines per new evidence route | | Days | None | Carry intentionally |
| 5 | `MAX_PAPERS_PER_REQUEST = 10` unreachable via UI (search caps at 8) — dead headroom | Low | +0 (inert) | | Minutes | None | Carry intentionally |
| 6 | Score-range invariant ([0,1]) split across three locations with no shared assertion | Low | +0 (inert) | | Hours | None | Carry intentionally |

### Recommended Order
Only #2 is worth touching pre-merge if the author is already in the file. #1 should get a one-line code comment now and a real fix deferred. #3–#6 are carry-intentionally — documented here so they don't get rediscovered as surprises later.

---

## 1. `responseFormat` absent from the `callLlm` cache key — Defer and monitor

**Location:** `app/lib/llm/callLlm.ts:151-152`, `app/lib/llm/cache.ts:16-25`
**Nature:** Caching correctness (latent)
**Cost of Deferral:** `+0 — inert today`
**Failure Cost:** `Low × Med — a structured-output call could return a cached free-text result (or vice-versa) from a different endpoint that happens to collide on (model, systemPrompt, userContent, maxTokens)`
**Legibility-target:** for-author

### Carrying Cost: Low
`computeHash` keys on `(model, systemPrompt, userContent, maxTokens)` only — `responseFormat` is not part of the key. Today this is harmless: every endpoint ships a distinct `systemPrompt`, and the JSON-shape instructions are embedded in that prompt, so two calls that differ only in `responseFormat` but share the prompt do not occur in practice. The risk is purely latent: a future endpoint that reuses an existing prompt with a different schema (or toggles structured output on/off) would silently serve the wrong-shaped cached payload.

### Fix Cost
- **Scope:** localized — add the schema (or a stable hash of it) as a 5th `computeHash` argument and to `CacheKey`.
- **Effort:** hours.
- **Risk:** low — but it invalidates all existing cache entries on deploy (acceptable; cache is best-effort and non-durable on Vercel per CLAUDE.md).
- **Incremental?** yes.

### Urgency Triggers
- A second endpoint reuses an existing `systemPrompt` while changing `responseFormat`. Until then there is no collision surface.

### Recommendation
**Recommendation:** Defer and monitor. Add a one-line comment at the `computeHash` call site noting that `responseFormat` is intentionally excluded and that this is safe only while prompts are unique per endpoint. Re-evaluate the moment a prompt is shared across endpoints with differing output formats.

---

## 2. Shared `errors[key]` map collides between search and scoring — Fix opportunistically

**Location:** `app/hooks/useEvidenceScoring.ts:27,44,46`, `app/hooks/useEvidenceSearch.ts:28,52`, `app/lib/stores/evidenceStore.ts`
**Nature:** Structural (state-shape) — overloaded store slice
**Cost of Deferral:** `+0 — inert`
**Legibility-target:** for-author

### Carrying Cost: Medium
The store added a dedicated `scoring[key]` loading map (good — it correctly separates search-loading from score-loading) but reused the single `errors[key]` slot for both operations. Consequences visible in the current code:
- `useEvidenceScoring.score` writes scoring failures into `errors[key]`, but the error is **only rendered by `FindEvidenceButton` via the search hook's `error`** (`EvidenceResultsSection` receives no error prop). So a scoring failure renders in the same spot as a search failure with no label distinguishing them.
- `score()` calls `setError(key, null)` on entry, silently clearing any prior **search** error; symmetrically a later search clears a scoring error. The two operations stomp each other's error state.

This is friction rather than a bug today (the two operations are mutually exclusive in time for a given element in normal use), but it is a misleading state shape: a reader reasonably assumes search-error and score-error are independent, and they are not.

### Fix Cost
- **Scope:** localized — either add a `scoringErrors[key]` map mirroring `scoring[key]`, or namespace error values. ~Hours.
- **Risk:** low — additive store change, persisted under `evidence-store-v1` (new optional map; old persisted state hydrates fine).
- **Incremental?** yes.

### Urgency Triggers
- Any UI change that surfaces score errors distinctly from search errors will force this split anyway.

### Recommendation
**Recommendation:** Fix opportunistically. The store change is small and the author is already in these exact files. If not fixed now, document that `errors[key]` is shared so a future reader does not assume independence.

---

## 3. Schema-dialect coupling — Carry intentionally

**Location:** `app/lib/llm/callLlm.ts:49-77,170-182`
**Nature:** Cross-provider coupling
**Cost of Deferral:** `+1 stripped keyword per JSON-Schema feature the source schemas adopt` (the deny-list must grow each time a source schema starts using a keyword Anthropic rejects)
**Legibility-target:** for-author

### Carrying Cost: Low
`adaptSchemaForAnthropic` strips a hard-coded deny-list (`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`) so OpenRouter-shaped schemas can be reused on the Anthropic path. This is a reasonable, well-commented adaptation. The debt is the maintenance contract: the deny-list is enumerated by trial-and-error ("Extend this set if other keywords surface"), so the next unsupported keyword fails at runtime against the live Anthropic API rather than at build/test time. The fact-check confirmed the strip-set is a correct superset of what is currently needed (Claim 1, Mostly Accurate), so there is no present gap — only future-maintenance exposure.

A secondary smell: stripping `minimum`/`maximum` means the [0,1] score constraint is *only* enforced server-side by `clampScore`. That is intentional and documented in the route schema comments, but it couples the schema's correctness to a runtime clamp living in a different file (see #6).

### Fix Cost
- **Scope:** localized but open-ended — a true fix (allow-list of Anthropic-supported keywords, or a typed schema-builder that emits per-provider variants) is Days, not Hours, and is over-engineering for one consumer.
- **Risk:** low.
- **Incremental?** yes.

### Recommendation
**Recommendation:** Carry intentionally. The deny-list approach is the right call at one consumer. Revisit only when a third structured-output endpoint lands or when the deny-list needs a third extension — at that point the recurring "add a keyword, get a runtime failure" cost justifies a test that asserts known schemas survive adaptation, or a switch to an allow-list.

---

## 4. Route-level duplication vs `evidence-search/route.ts` — Carry intentionally

**Location:** `app/api/evidence-score/route.ts` vs `app/api/evidence-search/route.ts`
**Nature:** Duplication
**Cost of Deferral:** `+~30 duplicated lines per new evidence-* route`
**Legibility-target:** for-author

### Carrying Cost: Low
The new route faithfully mirrors the sibling's structure — same import set, same `try { validate → callLlm → JSON.parse(stripCodeFences(text)) → catch }` skeleton, same `OpenRouterError`-then-generic catch block, same colocated `SYSTEM_PROMPT` + `SCHEMA` constants. This is consistency, not copy-paste rot: a reader who knows one route knows the other, and the duplication is shallow (boilerplate, not business logic). Extracting a shared "structured-output route" helper now would be premature — there are only two routes and they differ in their post-LLM processing (OpenAlex search/dedup vs. per-paper score validation).

One genuinely good move worth noting: the author extracted `scoreValidation.ts` out of the route specifically so it could be unit-tested (`scoreValidation.test.ts`, 143 lines). That is the *opposite* of debt — the sibling route's `mapOpenAlexWork`/`deduplicatePapers` follow the same pattern. The structure is consistent across the two routes.

### Fix Cost
- **Scope:** systemic if pursued (a shared route harness touches both routes). Days.
- **Risk:** medium — a shared abstraction over two slightly-divergent routes tends to grow conditionals.

### Recommendation
**Recommendation:** Carry intentionally. Two similar routes is below the threshold where a shared abstraction pays off. Revisit at the third evidence-* route — the rule-of-three applies cleanly here.

---

## 5. `MAX_PAPERS_PER_REQUEST = 10` is unreachable via UI — Carry intentionally

**Location:** `app/api/evidence-score/route.ts:18` (cap = 10) vs `app/api/evidence-search/route.ts` (`MAX_RESULTS = 8`)
**Nature:** Dead headroom / minor inconsistency
**Cost of Deferral:** `+0 — inert`
**Legibility-target:** for-author

### Carrying Cost: Low
Search returns at most 8 papers, scoring accepts up to 10, so the top 2 slots of the cap are unreachable through the product flow. This is harmless and arguably defensible (a defense-in-depth cap on a public route should not be coupled to the current UI limit). The only cost is a reader briefly wondering why the two numbers differ. Not a security gap — the cap still bounds token usage.

### Recommendation
**Recommendation:** Carry intentionally. Optionally drop a one-word comment (`// defense-in-depth; UI search caps at 8`) so the mismatch reads as intentional rather than as drift.

---

## 6. Score-range invariant split across three locations — Carry intentionally

**Location:** route schema comments (`route.ts:78,98`), `clampScore` (`scoreValidation.ts:13-16`), and the LLM prompt's "0.0 to 1.0" instructions (`route.ts` system prompt)
**Nature:** Distributed invariant
**Cost of Deferral:** `+0 — inert`
**Legibility-target:** for-author

### Carrying Cost: Low
The "[0,1]" contract is asserted in three places — the prompt asks for it, the schema *would* enforce it but the keyword is stripped for Anthropic, and `clampScore` is the real enforcement. This is correctly architected (clamp is the source of truth and is unit-tested), but the invariant's authority is non-obvious: a reader scanning the schema sees no `minimum`/`maximum` and has to find the clamp. The existing comments in `route.ts` already point at `clampScore`, which substantially mitigates this.

### Recommendation
**Recommendation:** Carry intentionally. Already adequately commented. No action.

---

## Goal-Alignment Note
- Answered: yes — triaged all debt the diff introduces, ranked by carry-vs-fix.
- Out of scope: correctness/security/perf of the scoring logic itself (other critics own those); whether LLM scoring is the right approach (product decision, not debt); the pre-existing Vercel cache non-durability noted in CLAUDE.md (not introduced by this PR).
- Escalate: nothing blocking. Item #2 (shared `errors[key]` map) is the one item worth surfacing to the author as a "fix-while-you're-here" — it is a genuine state-shape smell, not just cosmetics. Item #1 (cache key) warrants a one-line code comment now even though the real fix is deferred.
- Questions I would have asked: omitted — scope was clear.
