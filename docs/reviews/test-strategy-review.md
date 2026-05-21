# Test Strategy: feat/evidence-scoring (LLM evidence-paper scoring)

**Commit:** 0a96cce
**Scope:** `git diff main...HEAD` — `/api/evidence-score` route, `scoreValidation`, `useEvidenceScoring` hook, `evidenceStore` scoring actions, `callLlm.adaptSchemaForAnthropic`, evidence-card UI
**Reviewed:** 2026-05-21
**Legibility-target:** for-author

## Test Conventions

- **Framework:** Vitest + React Testing Library (`vitest.config.ts`, `vitest.setup.ts`).
- **Location:** tests live next to source as `*.test.ts(x)`; the stores subsystem uses a `__tests__/` directory (`app/lib/stores/__tests__/`). Either is acceptable per existing precedent.
- **Pure-function unit tests:** `scoreValidation.test.ts` and `openAlexUtils.test.ts` are the model — `describe`/`it`, table-style `expect` assertions, no mocks. Follow this for `adaptSchemaForAnthropic`.
- **Zustand store tests:** `workspaceStore.test.ts` resets via `setState(getInitialState())` in `beforeEach`, then calls actions through `getState()` and asserts on `getState()`. `evidenceStore` should follow the same pattern.
- **LLM mocking:** `callLlm.test.ts` mocks `@anthropic-ai/sdk` (capturing constructor + `messages.create`), plus `./cache`, `@/app/lib/analytics/persist`, and `./costs`. This mock harness is the established way to drive code through `callLlm`, and is reusable for a route test.
- **No API-route handler test exists anywhere** in the repo (confirmed: only `openAlexUtils.test.ts` and `scoreValidation.test.ts` under `app/api/`). A route test for `evidence-score/route.ts` would be the first; it is feasible by importing `POST` and constructing a `NextRequest`, mocking `callLlm`.

## Untested Paths Touched by the Change

- **G1** — `app/lib/llm/callLlm.ts:62-74` — `adaptSchemaForAnthropic` array branch and object-recursion branch: keyword stripping (`minimum`/`maximum`/etc.), recursion into nested schema objects/arrays, and non-mutation of the input — not covered (no test imports this export).
- **G2** — `app/lib/llm/callLlm.ts:64` — primitive/null passthrough branch (`adaptSchemaForAnthropic` returns scalars and `null` unchanged) — not covered.
- **G3** — `app/lib/llm/callLlm.ts:171-178` — Anthropic `output_config.format.schema` is built from `adaptSchemaForAnthropic(...)` output; the integration that the adapted schema (not the raw one) is what gets sent — not covered.
- **G4** — `app/lib/stores/evidenceStore.ts:117-143` — `applyScores`: the score-map join (`scoreMap.get` hit vs miss → paper left unchanged), the `allScored` invariant (`scored` true only when every paper has non-null `reliability`), and `scoredAt` timestamp set — not covered.
- **G5** — `app/lib/stores/evidenceStore.ts:118-119` — `applyScores` early return `{}` when `slot` is absent for the key — not covered.
- **G6** — `app/lib/stores/evidenceStore.ts:102-105` — `setScoring` toggles per-key `scoring` flag — not covered.
- **G7** — `app/lib/stores/evidenceStore.ts:153` — `clearAll` now also resets `scoring: {}` — not covered (regression risk: a future edit could drop the new key).
- **G8** — `app/api/evidence-score/route.ts:145-146` — 400 branch when `claimContent` missing or non-string — not covered.
- **G9** — `app/api/evidence-score/route.ts:148-149` — 400 branch when `papers` is not an array or is empty — not covered.
- **G10** — `app/api/evidence-score/route.ts:151-156` — 400 branch when `papers.length > MAX_PAPERS_PER_REQUEST` (boundary: 10 ok, 11 rejected) — not covered.
- **G11** — `app/api/evidence-score/route.ts:161-167` — 400 branch when a paper at index `i` is missing `openAlexId`/`title` (error message embeds the index) — not covered.
- **G12** — `app/api/evidence-score/route.ts:158` — `claimContent` truncation at `MAX_CLAIM_LENGTH` (5000) — not covered.
- **G13** — `app/api/evidence-score/route.ts:199-214` — mock-fallback branch when `callLlm` returns empty `text`: returns neutral 0.5 scores with `mock: true` for every input paper — not covered.
- **G14** — `app/api/evidence-score/route.ts:219-220` — 502 branch when parsed LLM response `.scores` is not an array — not covered.
- **G15** — `app/api/evidence-score/route.ts:224-227` — happy path: each raw score passed through `validatePaperScore`, structurally-invalid entries (returns `null`) silently dropped from the response array — not covered.
- **G16** — `app/api/evidence-score/route.ts:218` — `JSON.parse(stripCodeFences(text))` throwing on malformed LLM text falls into the outer `catch` → 500 — not covered; confirm whether a malformed payload should be a 502 instead.
- **G17** — `app/api/evidence-score/route.ts:231-240` — `catch`: `OpenRouterError` → 502 with `details`; generic `Error` → 500 with message — not covered (two distinct arms).
- **G18** — `app/api/evidence-score/route.ts:176-179` — paper-summary assembly branches: authors present (sliced to 5) vs absent, `year`/`journal` present vs absent, `abstract` present (sliced to 500) vs the `(not available)` fallback — not covered.
- **G19** — `app/hooks/useEvidenceScoring.ts:46-48` — `score` early returns when slot is missing or `papers.length === 0` — not covered.
- **G20** — `app/hooks/useEvidenceScoring.ts:50` — concurrent-guard early return when `scoring[key]` is already true (the double-click guard called out as verified) — not covered.
- **G21** — `app/hooks/useEvidenceScoring.ts:53-72` — success path (`applyScores` called with response scores; `setScoring(false)` in `finally`) vs error path (`fetchApi` throws → `setError` with message, `setScoring(false)` still runs) — not covered.
- **G22** — `app/components/features/evidence-search/EvidenceScoreBadge.tsx:21-25` — `scoreColor` traffic-light thresholds (>=0.7 green, >=0.4 amber, <0.4 red) and `Math.round(score * 100)` boundary rendering (0, 0.4, 0.7, 1) — not covered.
- **G23** — `app/api/evidence-search/openAlexUtils.ts` (2-line diff) — the modified util path; existing `openAlexUtils.test.ts` gained 6 lines, so likely covered — verify the new lines are exercised, otherwise treat as a gap.

## Recommended Tests

#### Unit test for `adaptSchemaForAnthropic`

**Closes gaps:** G1, G2
**Type:** unit
**Priority:** high
**File:** `app/lib/llm/callLlm.test.ts` (add a `describe("adaptSchemaForAnthropic")` block; it's already exported)
**What it verifies:** unsupported numeric-range keywords are recursively stripped from a nested JSON schema while all other content is preserved and the input object is not mutated.
**Key cases:**
- Top-level object with `minimum`/`maximum` → keys removed, siblings (`type`, `properties`) preserved.
- Deeply nested: a `properties.score` object carrying `minimum`/`maximum` (mirrors the real `SCORING_SCHEMA` shape) → stripped at depth.
- Array of subschemas (e.g. `items` as an array, or `enum`) → recursion maps each element; `enum` string arrays survive unchanged (they are not schema-keyword objects).
- All five keywords stripped: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`.
- Non-mutation: deep-clone the input, run the function, assert the original `===`-equals the clone (the doc comment promises "the input is not mutated").
- Passthrough: `adaptSchemaForAnthropic(null)`, `(42)`, `("rct")`, `(true)` return the value unchanged.

**Setup needed:** none — pure function, no mocks. This is the highest value-to-effort test in the PR.

#### Unit tests for `evidenceStore` scoring actions

**Closes gaps:** G4, G5, G6, G7
**Type:** unit
**Priority:** high
**File:** `app/lib/stores/__tests__/evidenceStore.test.ts` (new; mirror `workspaceStore.test.ts` reset pattern)
**What it verifies:** `applyScores` correctly joins scores onto papers and computes the `scored` invariant; `setScoring` and the `clearAll` reset behave correctly.
**Key cases:**
- `applyScores` with a slot containing 2 papers, scores for both → both papers get `reliability`/`relatedness`, `scored === true`, `scoredAt` is an ISO string.
- `applyScores` with scores for only 1 of 2 papers → unmatched paper unchanged (still `reliability: null`), `scored === false` (the partial-coverage invariant).
- `applyScores` with a score whose `openAlexId` matches no paper → ignored, no throw.
- `applyScores` for a key with no slot → returns without error, state unchanged (G5).
- `setScoring(key, true)` then `false` → `scoring[key]` reflects each set (G6).
- `clearAll()` → `slots`, `loading`, `scoring`, `errors` all reset to `{}` (G7 — guards the new key from being dropped in a future refactor).

**Setup needed:** `beforeEach` resetting via `useEvidenceStore.setState(useEvidenceStore.getInitialState())`; build a slot fixture with `EvidencePaper` objects (`reliability: null`).

#### Route handler test for `/api/evidence-score` (validation + branches)

**Closes gaps:** G8, G9, G10, G11, G12, G13, G14, G15, G16, G17, G3
**Type:** integration (route handler with `callLlm` mocked)
**Priority:** high (validation branches), medium (LLM-dependent branches)
**File:** `app/api/evidence-score/route.test.ts` (new — would be the repo's first API-route test)
**What it verifies:** request validation rejects malformed input with the correct status/message, and response assembly handles the mock-fallback, malformed-LLM, and error paths.
**Key cases:**
- Missing/non-string `claimContent` → 400 `"claimContent is required"` (G8).
- `papers` not an array, and empty array → 400 (G9).
- 10 papers accepted, 11 papers → 400 `"Too many papers (max 10)"` (G10 boundary).
- A paper missing `openAlexId` or `title` → 400 with the index in the message (G11).
- `claimContent` longer than 5000 chars → assert the message passed to the mocked `callLlm` is truncated (G12; assert on the captured `userContent`/`claimContent`).
- `callLlm` resolves `{ text: "" }` → 200 with every paper scored 0.5 and `mock: true` (G13).
- `callLlm` resolves text whose parsed `.scores` is not an array → 502 `"Invalid LLM response format"` (G14).
- `callLlm` resolves valid text where one score entry lacks `openAlexId` → that entry dropped, others returned (G15, exercises the `validatePaperScore`-returns-null filter).
- `callLlm` resolves non-JSON text → outer catch → 500; **flag G16**: decide whether malformed LLM output should be 502 not 500, then assert the chosen contract.
- `callLlm` throws `OpenRouterError` → 502 with `details`; `callLlm` throws generic `Error` → 500 (G17, two arms).
- Schema-adaptation integration (G3): assert the mocked Anthropic path receives the keyword-stripped schema — can be folded into the `callLlm.test.ts` Anthropic mock rather than the route test if simpler.

**Setup needed:** `vi.mock("@/app/lib/llm/callLlm")` returning a controllable mock for `callLlm` and re-exporting the real `OpenRouterError` class (so `instanceof` works); construct requests via `new NextRequest(url, { method: "POST", body: JSON.stringify(...) })` or a minimal `{ json: async () => body }` stub. This establishes the route-test harness the repo currently lacks.

#### Hook test for `useEvidenceScoring`

**Closes gaps:** G19, G20, G21
**Type:** unit (hook, via `@testing-library/react` `renderHook`)
**Priority:** medium
**File:** `app/hooks/useEvidenceScoring.test.ts` (new; `useDecomposition.test.ts` is the precedent for hook tests)
**What it verifies:** the scoring trigger guards (no slot / empty papers / already scoring), and the success vs error effect on store state.
**Key cases:**
- `score()` with no slot for the key → no `fetchApi` call (G19).
- `score()` with a slot of 0 papers → no `fetchApi` call (G19).
- `score()` while `scoring[key]` already true → no second `fetchApi` call (G20, double-click guard).
- Success: `fetchApi` resolves scores → `applyScores` applied, `isScoring` ends false (G21).
- Error: `fetchApi` rejects → `error` set to the message, `isScoring` ends false (G21 — the `finally` runs).

**Setup needed:** `vi.mock("@/app/lib/formalization/api")` for `fetchApi`; real `useEvidenceStore` seeded with a slot fixture via `setState`.

#### Unit test for `EvidenceScoreBadge` color thresholds

**Closes gaps:** G22
**Type:** unit (render)
**Priority:** low
**File:** `app/components/features/evidence-search/EvidenceScoreBadge.test.tsx` (new)
**What it verifies:** the traffic-light class boundaries and score rounding.
**Key cases:**
- score 0.7 → green class; 0.69 → amber; 0.4 → amber; 0.39 → red; 0 → red; 1 → green.
- score 0.756 → renders `76` (rounding).

**Setup needed:** none beyond RTL `render` + class/text assertions.

## What NOT to Test

- **`SCORING_SYSTEM_PROMPT` / `SCORING_SCHEMA` literal content** (`route.ts:30-138`) — static config, not logic. Asserting on prompt wording produces brittle tests that break on every prompt tweak. The schema is exercised indirectly via G3. (Note `route.ts:18` documents that `clampScore` enforces the score range server-side because the schema omits `minimum`/`maximum` — this coupling is covered by the existing `scoreValidation` tests.)
- **`STUDY_TYPE_LABELS` / `STUDY_TYPES` constants** — pure data already exercised by `normalizeStudyType` tests.
- **`scoreValidation.ts`** — already comprehensively covered by the existing `scoreValidation.test.ts` (clamp, normalize, validate, red-flag filtering, range clamping). No new tests needed; the route test should mock around it or rely on it, not re-test it.
- **`EvidenceResultsSection.tsx` / `EvidencePaperCard.tsx` / `FindEvidenceButton.tsx` full render trees** — high setup cost, mostly presentational wiring around the hook and badge already covered above. Defer unless a specific interaction (e.g. the "Score papers" button calling `score()`) is deemed high-risk; if so, add one focused interaction test rather than a full snapshot.

## Coverage Gaps Beyond Current Scope

**1.** No API-route handler has any test in the repo. This PR is the natural place to establish the first route-test harness (mock `callLlm`, construct `NextRequest`); doing so unblocks future route coverage across `formalization`, `verification`, and `decomposition` routes.

**2.** The mock-fallback contract (`text` empty → neutral 0.5 + `mock: true`) is duplicated conceptually with the Lean-verifier silent-pass behavior noted in CLAUDE.md. Consider a shared "no-key mock" assertion pattern so all routes' mock fallbacks are tested consistently.

**3.** `openAlexUtils.ts` changed (2 lines) with a 6-line test addition — verify the new lines are actually exercised (G23); if not, it is an in-scope gap that slipped the existing test.

## Summary

The highest-value test is the **`adaptSchemaForAnthropic` unit test** (G1, G2): the function is pure, trivially testable, has zero existing coverage, and guards a correctness-critical, easy-to-regress invariant (recursion + keyword stripping + non-mutation) with no setup cost. Close behind are the **`evidenceStore.applyScores` invariant tests** (G4 — the "only `scored` if every paper scored" rule is exactly the kind of silent-wrong-answer bug tests exist to catch) and the **route validation-branch tests** (G8-G11, G17), which also establish the repo's first API-route test harness. After this plan, the main residual risk is the LLM-content-dependent behavior (prompt quality, score calibration) which is inherently not unit-testable, and the presentational evidence-card components, which are deprioritized. One open question surfaced by enumeration (G16): malformed-but-parseable vs. throwing LLM output currently routes to 500 via the outer catch — confirm whether that should be a 502 to match the explicit `"Invalid LLM response format"` 502 branch before pinning it in a test.

## Goal-Alignment Note
- Answered: yes
- Out of scope: deep render tests of the three evidence-card components (high setup cost, presentational) and re-testing `scoreValidation` (already covered) — set aside per value/effort ranking, documented in What NOT to Test.
- Escalate: the repo has no API-route test harness; this PR should establish one (Beyond-Scope #1). Also G16 is a contract question (500 vs 502 on malformed LLM output) the orchestrator/author should resolve before the route test pins the behavior.
- Questions I would have asked: omitted — scope was clear.
