# Code Fact-Check Report

**Commit:** 3f916e2
**Repository:** /home/magfrump/aisc_lct/meta-formalism-copilot
**Scope:** branch diff `feat/evidence-scoring` (main...HEAD)
**Checked:** 2026-05-21
**Total claims checked:** 12
**Summary:** 8 verified, 2 mostly accurate, 0 stale, 1 incorrect, 1 unverifiable

> No `docs/reviews/hallucination-patterns.md` exists; none of the verdicts below qualify as fabrication patterns, so no log was created.

---

## Claim 1: "JSON-Schema validation keywords that Anthropic's structured-output schema validator rejects ... Confirmed unsupported: numeric-range keywords. Anthropic returns e.g. \"output_config.format.schema: For 'number' type, properties maximum, minimum are not supported\". Extend this set if other keywords surface."

**Location:** `app/lib/llm/callLlm.ts:49-62`
**Type:** Behavioral
**Verdict:** Mostly accurate
**Confidence:** Medium

The comment names a specific set of stripped keywords, and the implementing set matches the listed keywords plus three more:

```ts
// app/lib/llm/callLlm.ts:56-62
const ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
]);
```

The comment's "Confirmed unsupported" statement is scoped narrowly to `minimum`/`maximum` (the two that produced the quoted Anthropic error), and the set additionally strips `exclusiveMinimum`, `exclusiveMaximum`, and `multipleOf`. The comment frames these extras correctly via "Extend this set if other keywords surface," so the set is a superset of what is *confirmed* — directionally accurate, but the comment does not assert the extra three are confirmed-rejected (they are pre-emptive). The exact wording of the quoted Anthropic error message is an external-API behavior that cannot be confirmed from the codebase (paraphrased — no quote available because the error string originates from Anthropic's server, not this repo). Mark Mostly accurate: the keywords the code is documented to handle (`minimum`/`maximum`) are handled, but the comment's quoted error text is unverifiable from static analysis.

**Evidence:** `app/lib/llm/callLlm.ts:49-62`, `app/lib/llm/callLlm.ts:171-182`

---

## Claim 2: "Recursively strip keywords Anthropic's structured-output validator does not support, returning a new schema (the input is not mutated)."

**Location:** `app/lib/llm/callLlm.ts:64-65`
**Type:** Behavioral / Invariant
**Verdict:** Verified
**Confidence:** High

The function builds a fresh object/array rather than mutating its input:

```ts
// app/lib/llm/callLlm.ts:66-77
export function adaptSchemaForAnthropic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(adaptSchemaForAnthropic);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS.has(k)) continue;
      out[k] = adaptSchemaForAnthropic(v);
    }
    return out;
  }
  return value;
}
```

`Array.prototype.map` returns a new array, the object branch writes to a fresh `out` object, and primitives are returned by value — no input property is reassigned or deleted. Recursion descends into both arrays and objects. Both the non-mutation and recursive claims hold.

**Evidence:** `app/lib/llm/callLlm.ts:66-77`

---

## Claim 3: "When provided, enforces structured JSON output. Sent to OpenRouter as `response_format`, and to Anthropic as `output_config.format` after stripping keywords Anthropic doesn't support (see adaptSchemaForAnthropic)."

**Location:** `app/lib/llm/callLlm.ts:86-89`
**Type:** Behavioral / Architectural
**Verdict:** Verified
**Confidence:** High

Both dispatch paths match the claim. Anthropic path sends `output_config.format` with the adapted schema:

```ts
// app/lib/llm/callLlm.ts:170-182
...(responseFormat && {
  output_config: {
    format: {
      type: "json_schema" as const,
      schema: adaptSchemaForAnthropic(
        responseFormat.json_schema.schema,
      ) as Record<string, unknown>,
    },
  },
}),
```

OpenRouter path sends the raw `response_format`:

```ts
// app/lib/llm/callLlm.ts:211
...(responseFormat && { response_format: responseFormat }),
```

**Evidence:** `app/lib/llm/callLlm.ts:170-182`, `app/lib/llm/callLlm.ts:211`

---

## Claim 4: "Construct a fresh Anthropic client per call. ... per-call construction means an env-var rotation ... takes effect on the next request without needing a redeploy or process restart."

**Location:** `app/lib/llm/callLlm.ts:10-13`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`makeAnthropicClient` is invoked inside the request path (not memoized at module scope), and the key is read from `process.env` on each call:

```ts
// app/lib/llm/callLlm.ts:142
const anthropicKey = process.env.ANTHROPIC_API_KEY;
// app/lib/llm/callLlm.ts:164
const client = makeAnthropicClient(anthropicKey);
```

`makeAnthropicClient` returns `new Anthropic({ apiKey })` (`callLlm.ts:14-16`), so each request reads the current env value and builds a new client. The rotation claim holds for static-analysis purposes.

**Evidence:** `app/lib/llm/callLlm.ts:14-16`, `app/lib/llm/callLlm.ts:142`, `app/lib/llm/callLlm.ts:161-164`

---

## Claim 5: "Range enforced server-side by clampScore (Anthropic's structured-output schema rejects minimum/maximum)." (route schema, both reliability.score and relatedness.score)

**Location:** `app/api/evidence-score/route.ts:104-105` and `app/api/evidence-score/route.ts:122-123`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The schema declares `score` as a bare `number` with no `minimum`/`maximum`, and range enforcement happens server-side in `clampScore`:

```ts
// app/api/evidence-score/scoreValidation.ts:14-17
export function clampScore(score: unknown): number {
  const n = typeof score === "number" && isFinite(score) ? score : 0;
  return Math.max(0, Math.min(1, n));
}
```

`validatePaperScore` routes both `rel?.score` and `relat?.score` through `clampScore` (`scoreValidation.ts:38,46`). The "Anthropic rejects minimum/maximum" sub-claim is consistent with the keyword-strip set in Claim 1. The clamp-to-[0,1] behavior is directly tested (`scoreValidation.test.ts:15-36`).

**Evidence:** `app/api/evidence-score/route.ts:98-126`, `app/api/evidence-score/scoreValidation.ts:14-17`, `app/api/evidence-score/scoreValidation.ts:35-48`

---

## Claim 6: "Clamp a score to [0, 1]" (clampScore docstring)

**Location:** `app/api/evidence-score/scoreValidation.ts:13`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

`Math.max(0, Math.min(1, n))` clamps to the closed interval [0,1], and non-finite/non-number input falls back to `0`:

```ts
// app/api/evidence-score/scoreValidation.ts:15-16
const n = typeof score === "number" && isFinite(score) ? score : 0;
return Math.max(0, Math.min(1, n));
```

Tests confirm `1.5 -> 1`, `-0.5 -> 0`, `NaN/Infinity -> 0`, and non-numbers `-> 0` (`scoreValidation.test.ts:15-36`).

**Evidence:** `app/api/evidence-score/scoreValidation.ts:13-17`, `app/api/evidence-score/scoreValidation.test.ts:8-37`

---

## Claim 7: "Validate and clean a single paper score from LLM output. Returns null if the score is structurally invalid (missing openAlexId)."

**Location:** `app/api/evidence-score/scoreValidation.ts:27-28`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High

The only early-return-null path is the missing/non-string `openAlexId` guard:

```ts
// app/api/evidence-score/scoreValidation.ts:30
if (!raw.openAlexId || typeof raw.openAlexId !== "string") return null;
```

Missing `reliability`/`relatedness` do not return null — they default (score `0`, studyType `"unknown"`, empty rationale/redFlags), confirmed by test "handles missing reliability and relatedness gracefully" (`scoreValidation.test.ts:97-106`) and "returns null when openAlexId is missing" (`scoreValidation.test.ts:91-95`). Note `openAlexId: ""` returns null because `!raw.openAlexId` is truthy-negated for empty string — consistent with the test at line 93.

**Evidence:** `app/api/evidence-score/scoreValidation.ts:29-50`, `app/api/evidence-score/scoreValidation.test.ts:91-106`

---

## Claim 8: "Methodology red flags detected (e.g. p-hacking indicators, small sample)"

**Location:** `app/lib/types/evidence.ts:73`
**Type:** Behavioral
**Verdict:** Incorrect
**Confidence:** High

The `ReliabilityScore.redFlags` doc comment offers "p-hacking indicators" as an example of a detected red flag, but the scoring system prompt explicitly forbids flagging p-hacking:

```ts
// app/api/evidence-score/route.ts:36
//   - Identify red flags detectable from title/abstract: stated small sample sizes (e.g. n < 20), self-described "exploratory" or "pilot" studies, disclosed conflicts of interest, retraction notices. Do NOT flag p-hacking or variable counts unless explicitly stated in the abstract.
```

The prompt directs the LLM to NOT flag p-hacking (unless explicitly stated in the abstract), so "p-hacking indicators" is a misleading example for a field that the LLM-driven pipeline is instructed to avoid producing. "Small sample" is consistent with the prompt ("stated small sample sizes"). A reader acting on the type comment would expect p-hacking detection that the prompt deliberately suppresses. Recommend changing the example to one the prompt actually requests (e.g., "small sample, conflicts of interest, retraction notices").

**Evidence:** `app/lib/types/evidence.ts:73`, `app/api/evidence-score/route.ts:36`

---

## Claim 9: "Triggers LLM-based reliability and relatedness scoring for all papers in the slot, then applies scores back to the store. Scoring is separate from search so users can choose when to spend LLM tokens on assessment."

**Location:** `app/hooks/useEvidenceScoring.ts:13-19`
**Type:** Behavioral / Architectural
**Verdict:** Verified
**Confidence:** High

The hook posts all papers in the slot to `/api/evidence-score` and applies results via `applyScores`:

```ts
// app/hooks/useEvidenceScoring.ts:44-58
const result = await fetchApi<EvidenceScoreResponse>(
  "/api/evidence-score",
  {
    claimContent,
    papers: currentSlot.papers.map((p) => ({ ... })),
  },
);
applyScores(key, result.scores);
```

Scoring is a distinct hook/route from search: `useEvidenceSearch` populates the slot and sets `scored: false` (`useEvidenceSearch.ts:47-48`), and scoring is only triggered by the separate "Score papers" button wired through `onScore` (`FindEvidenceButton.tsx:44-49`). The "all papers in the slot" claim holds — the map iterates `currentSlot.papers` with no filter. The "separate so users choose when to spend tokens" claim accurately describes the two-button architecture.

**Evidence:** `app/hooks/useEvidenceScoring.ts:33-68`, `app/hooks/useEvidenceSearch.ts:44-48`, `app/components/features/evidence-search/FindEvidenceButton.tsx:40-49`

---

## Claim 10: "Only mark as fully scored if every paper received a score" (applyScores)

**Location:** `app/lib/stores/evidenceStore.ts:131`
**Type:** Behavioral / Invariant
**Verdict:** Verified
**Confidence:** High

`scored` is set to `allScored`, which requires every paper to have non-null `reliability`:

```ts
// app/lib/stores/evidenceStore.ts:132
const allScored = updatedPapers.every((p) => p.reliability !== null);
```

A paper's `reliability` is only populated when a matching score exists in the score map (`evidenceStore.ts:121-129`); papers with no returned score keep their prior `reliability` (null after search). So `scored` becomes true only when all papers were scored, matching the comment. (The check keys on `reliability` alone, not `relatedness`, but `PaperScore` always carries both together so this is not a divergence.)

**Evidence:** `app/lib/stores/evidenceStore.ts:117-144`

---

## Claim 11: "Separate from the main workspaceStore because evidence is metadata *about* artifacts ... Persists to localStorage with the same debounced write pattern as workspaceStore to avoid excessive serialization."

**Location:** `app/lib/stores/evidenceStore.ts:1-10`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High

The evidence store's debounced adapter matches workspaceStore's pattern — a 300ms `setTimeout` that `clearTimeout`s a pending write:

```ts
// app/lib/stores/evidenceStore.ts:24-33
setItem: (name: string, value: string) => {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    try { localStorage.setItem(name, value); }
    catch (e) { console.warn("Failed to persist evidence store:", e); }
    pending = null;
  }, 300);
},
```

`workspaceStore.ts` uses the same construction: "writes are debounced by 300ms" with `clearTimeout`/`setTimeout(..., 300)` (`workspaceStore.ts:28,40-48`). The "same pattern" and "300ms debounce" claims hold. The store is indeed a separate Zustand `create` instance from workspaceStore (paraphrased — no quote available because the separateness is established by two distinct `create(...)` calls in different files, not a single snippet).

**Evidence:** `app/lib/stores/evidenceStore.ts:20-41`, `app/lib/stores/evidenceStore.ts:87-88`, `app/lib/stores/workspaceStore.ts:28,36-48`

---

## Claim 12: "Too many papers (max ${MAX_PAPERS_PER_REQUEST})" — MAX_PAPERS_PER_REQUEST = 10 as the scoring request limit, relative to the evidence-search MAX_RESULTS

**Location:** `app/api/evidence-score/route.ts:21`
**Type:** Configuration
**Verdict:** Verified
**Confidence:** High

The scoring route caps inbound papers at 10:

```ts
// app/api/evidence-score/route.ts:21
const MAX_PAPERS_PER_REQUEST = 10;
// app/api/evidence-score/route.ts:151-156
if (body.papers.length > MAX_PAPERS_PER_REQUEST) {
  return NextResponse.json(
    { error: `Too many papers (max ${MAX_PAPERS_PER_REQUEST})` },
    { status: 400 },
  );
}
```

The evidence-search route returns at most 8 papers:

```ts
// app/api/evidence-search/route.ts:20
const MAX_RESULTS = 8;
// app/api/evidence-search/route.ts:181
const papers = deduplicatePapers(relevantWorks.map(mapOpenAlexWork)).slice(0, MAX_RESULTS);
```

The `MAX_PAPERS_PER_REQUEST = 10` value and the error-message interpolation are both accurate. Observation (not a documentation defect): because search caps a slot at 8 papers and scoring sends the whole slot (`useEvidenceScoring.ts:48`), the 10-paper limit can never be reached through the normal UI flow — it only guards direct API callers. No comment claims the two constants are coupled, so there is no documentation mismatch; flagging the headroom for the orchestrator.

**Evidence:** `app/api/evidence-score/route.ts:21`, `app/api/evidence-score/route.ts:151-156`, `app/api/evidence-search/route.ts:20`, `app/api/evidence-search/route.ts:181`, `app/hooks/useEvidenceScoring.ts:48`

---

## Claims Requiring Attention

### Incorrect
- **Claim 8** (`app/lib/types/evidence.ts:73`): `redFlags` doc comment cites "p-hacking indicators" as an example, but the scoring prompt (`route.ts:36`) explicitly instructs the LLM NOT to flag p-hacking. Replace the example with one the prompt actually requests (small sample, conflicts of interest, retraction notices). **Legibility-target: for-author.**

### Stale
- None.

### Mostly Accurate
- **Claim 1** (`app/lib/llm/callLlm.ts:49-62`): the strip-set is a superset of the confirmed-rejected keywords (`minimum`/`maximum`); `exclusiveMinimum`/`exclusiveMaximum`/`multipleOf` are pre-emptive and the quoted Anthropic error string is not verifiable from this repo. Comment is honest about this ("Extend this set if other keywords surface") but the "Confirmed unsupported" framing strictly applies only to the first two. **Legibility-target: for-author.**

### Unverifiable
- **Claim 1 (sub-part)** (`app/lib/llm/callLlm.ts:53-55`): the exact Anthropic error message text quoted in the comment originates from Anthropic's server and cannot be confirmed against the codebase; would require a live API call with a `minimum`/`maximum` schema to verify verbatim. **Legibility-target: for-orchestrator-synthesis.**

### Verified (for-orchestrator-synthesis)
- Claims 2, 3, 4, 5, 6, 7, 9, 10, 11, 12 — all **Legibility-target: for-orchestrator-synthesis.**

## Goal-Alignment Note
- Answered: yes
- Out of scope: Code-quality observations (e.g. `responseFormat` not being part of the cache key in `callLlm`, the 10-vs-8 headroom) were noted only where a documentation claim touched them; full review of those belongs to the performance/security/api-consistency critics.
- Escalate: Claim 8 is a genuine doc/behavior contradiction (p-hacking) worth a one-line fix before merge; the orchestrator may also want the api-consistency or performance critic to weigh in on the unused 10-paper headroom (Claim 12) and the cache-key composition in `callLlm.ts`.
