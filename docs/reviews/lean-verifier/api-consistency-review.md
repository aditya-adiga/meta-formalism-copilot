# API Consistency Review — `feat/lean-verifier-graceful-degradation`

**Repository:** meta-formalism-copilot
**Branch:** feat/lean-verifier-graceful-degradation
**Commit:** c95c9cb50d1a3634e655700f1b6c768a6774fe9b
**Scope:** `git diff origin/main...HEAD` — 10 files
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/lean-verifier/code-fact-check-report.md` (used as foundation)

---

## Baseline Conventions

Surveyed `app/api/{verification,formalization,edit,explanation,refine,predict,decomposition,analytics}/**`,
`app/lib/formalization/api.ts`, and the upstream verifier service in `verifier/server.ts`. The
established patterns in this codebase are:

1. **Request validation errors** use the envelope `{ error: string }` (sometimes with `details`), at
   HTTP `400` for missing fields or `502` for upstream LLM failures. Examples: `verification/lean`
   (the existing `leanCode is required` 400 case), `decomposition/extract` (400), every LLM route
   (502 with `OpenRouterError`).
2. **Successful JSON responses** use a flat object with **no** wrapper envelope — fields appear at
   the top level (`{ leanCode }`, `{ proof }`, `{ explanation }`, `{ text }`, `{ valid, errors }`).
3. **Domain failures (the verifier's "this proof is invalid")** return `200` with `{ valid: false, errors }`
   — they are *not* HTTP errors. The `200`/`400`/`502` axis is reserved for "request well-formed and
   serviced vs. malformed vs. infrastructure failure," not for the domain outcome.
4. **Naming**: camelCase throughout (`leanCode`, `verificationStatus`, `sourceText`, `nodeLabel`).
   The new `unavailable`, `reason`, `detail` fields all conform.
5. **String enum values** for status fields use lowercase-with-dashes literals
   (`VerificationStatus = "none" | "verifying" | "valid" | "invalid"`,
   `LoadingPhase = "idle" | ... | "reverifying"`,
   `NodeVerificationStatus = "unverified" | "in-progress" | "verified" | "failed"`). The new
   `"unavailable"` literal and the new `UnavailableReason` enum (`verifier-not-configured`,
   `verifier-unreachable`, `verifier-error`) follow this convention.
6. **Client helpers** in `app/lib/formalization/api.ts` consistently expose a typed result
   (`generateLean → string`, `generateSemiformal → string`, `verifyLean → { valid, errors, ... }`)
   and the consumers map domain status to UI status at the call site.

The upstream verifier service (`verifier/server.ts:107-110`) already uses a graduated shape: `{ valid: true }`,
`{ valid: false, errors }`, or for protocol-level problems `{ error }` at 4xx/5xx. The Next.js route
historically forwarded the verifier's body and status; on this branch it consumes that body and
re-shapes for unavailability.

---

## Findings

#### `unavailable: true` is set on the response but is not part of the documented `VerifyLeanResult` JSDoc precondition

**Severity:** Minor
**Location:** `app/lib/formalization/api.ts:104-109`
**Move:** #2 (naming/contract), #4 (error consistency)
**Confidence:** Medium

The exported `VerifyLeanResult` type promises three fields (`valid`, `errors`, `unavailable`). The
JSDoc on `unavailable` says "True when the verifier is not configured or could not be reached." The
fact-check report (Claim 4) flagged this as a slight understatement: the route also sets `unavailable: true`
on the **verifier-error** path (configured + reachable + non-2xx upstream), which is neither
"not configured" nor "could not be reached." The behavior is fine — the field correctly signals
"the proof was not actually checked" — but the contract description omits the third case. A consumer
reading the JSDoc and writing logic like "show 'configure your verifier' help when `unavailable` is true"
will get false positives on transient upstream errors.

**Recommendation:** Update the JSDoc to "True when the verifier did not check the proof — either it
is not configured, was unreachable, or returned a non-2xx response." If the three sub-cases matter
to consumers, surface `reason` on `VerifyLeanResult` (see next finding).

---

#### `reason` and `detail` from the server are dropped by the `verifyLean()` client helper

**Severity:** Inconsistent
**Location:** `app/lib/formalization/api.ts:120-132`, `app/api/verification/lean/route.ts:5-14`
**Move:** #7 (asymmetry between server response and client type)
**Confidence:** High

The route returns a 4-field JSON: `{ valid, unavailable, reason, detail? }`. The `reason` is a
typed enum (`UnavailableReason`) the route author clearly intended to be consumer-facing — they
defined it as a named type and use three distinct values. The `detail` carries `HTTP <status>` for
the verifier-error case. But `verifyLean()` extracts only `valid`, `errors`, and `unavailable`,
silently discarding both. The UI banner (`LeanCodeDisplay.tsx:132-143`) and badge tooltip
(`VerificationBadge.tsx:14-15`) therefore show identical copy ("Set the `LEAN_VERIFIER_URL` environment
variable…") regardless of whether the reason is `verifier-not-configured` (the env var is missing —
helpful) or `verifier-unreachable`/`verifier-error` (the env var *is* set but the configured host
is dead — the suggested fix is wrong).

This is a classic create-vs-read asymmetry: the server adds a richer field set, the client throws
half of it away, and the UI ends up with the lowest-common-denominator messaging. The `reason`
field is not breaking — adding it to `VerifyLeanResult` is a backward-compatible expansion — but
the current state means the work the server did to distinguish three cases provides no consumer
benefit.

**Recommendation:** Extend `VerifyLeanResult` to optionally carry `reason?: "verifier-not-configured"
| "verifier-unreachable" | "verifier-error"` and have `verifyLean()` pass it through. Use it in
`LeanCodeDisplay`/`VerificationBadge` to render situation-appropriate copy (or at minimum, leave
the door open for a follow-up to do so). Co-locate the `UnavailableReason` type so server and
client share it.

---

#### Verifier-error path drops the upstream `errors` body (mild behavior change)

**Severity:** Inconsistent
**Location:** `app/api/verification/lean/route.ts:45-49`
**Move:** #3 (consumer contract / subtle breaking change)
**Confidence:** High

Before this branch, a non-2xx response from the verifier service was forwarded verbatim
(`return NextResponse.json(data, { status: res.status })`). After this branch it is collapsed to
`{ valid: false, unavailable: true, reason: "verifier-error", detail: "HTTP <status>" }` at HTTP 200.

The semantic change is intentional and reasonable: a verifier 5xx genuinely means "the proof was
not checked," not "the proof is wrong." However, consumers that previously distinguished a verifier
4xx (e.g., the verifier's own `{ error: "leanCode is required and must be a string" }` at 400, see
`verifier/server.ts:90`) from a 5xx (`{ error: "Build queue full…" }` at 503) will no longer see
those distinctions; they all now collapse to a single `verifier-error` reason with only the HTTP
status in `detail`. The upstream `errors` body — which can carry useful diagnostic text — is
discarded entirely (`const data = await res.json()` was moved past the `!res.ok` check at line 51).

In practice the only consumer is `verifyLean()`, so the consumer impact is contained. But this is
a contract change worth being explicit about, and `detail` could be richer.

**Recommendation:** Either (a) document that verifier-error responses intentionally suppress
upstream error bodies, or (b) include the upstream body in `detail` (e.g., parse and include the
upstream `error` field if present). Option (b) costs little and helps debugging.

---

#### `unavailable` precedence over `valid` is consistent, but the wire format permits a contradictory state

**Severity:** Minor
**Location:** `app/api/verification/lean/route.ts:7-14`, `app/lib/formalization/api.ts:115-118`
**Move:** #8 (nullability/contract clarity)
**Confidence:** Medium

The route always emits `{ valid: false, unavailable: true, … }` for the three failure paths, and
`verifyResultToStatus` defensively prefers `unavailable` over `valid`. Good. However, the wire
contract leaves the door open for `{ valid: true, unavailable: true }` (server bug), or
`{ unavailable: false, valid: true, errors: "boom" }` (also nonsensical). A consumer writing TS
against the JSON shape would see no compile-time guarantee.

This is more of a "could be tightened" than a real bug — `verifyResultToStatus`'s precedence rule
already handles the surface case. Worth noting because the docstring frames it as defensive
("`unavailable` wins over `valid` so a missing verifier never reads as a passing proof"), which
suggests the author was aware of the asymmetry risk.

**Recommendation:** Consider modeling the response as a tagged union on the wire
(`{ status: "valid" } | { status: "invalid", errors } | { status: "unavailable", reason, detail? }`)
in a follow-up. Not a blocker.

---

#### Stale documentation in `README.md` and `docs/ARCHITECTURE.md`

**Severity:** Inconsistent
**Location:** `README.md:84, 92`, `docs/ARCHITECTURE.md:200-205`
**Move:** #3 (documentation drift)
**Confidence:** High

Surfacing the fact-check report's stale findings (Claims 13, 14):

- `README.md:84` documents a `http://localhost:3100` default that no longer exists; the route now
  treats unset `LEAN_VERIFIER_URL` as "not configured."
- `README.md:92` documents the `{ valid: true, mock: true }` mock-fallback that this branch
  removes. A reader following the README would expect a green-pass fallback that no longer exists.
- `docs/ARCHITECTURE.md:200-205` repeats the same `{ valid: true, mock: true }` claim.

Project CLAUDE.md (root) explicitly requires updating `README.md` and `docs/ARCHITECTURE.md` when
behavior changes; this is a contract gap with developers/operators, not API consumers, but it falls
under documentation drift in cognitive move #3.

**Recommendation:** Update both docs in this branch (or a follow-up doc-only PR) to reflect
the new "no default URL, returns `unavailable=true` on missing config or unreachable verifier"
behavior. Mention the new `unavailable` field in the API surface description if the README/ARCH
documents the verification API shape.

---

#### `LoadingPhase` not extended; pipeline reaches "idle" while keeping `unavailable` in the artifact UI — likely fine, worth confirming

**Severity:** Informational
**Location:** `app/lib/types/session.ts:2`, `useFormalizationPipeline.ts:121-135`
**Move:** #2 (type symmetry across related enums)
**Confidence:** Low

`VerificationStatus` got a new `"unavailable"` member; the parallel `LoadingPhase` enum was not
touched. That's correct — "unavailable" is a *terminal* status, not a *transient phase* — but it
means the pipeline's "we tried, it didn't work, you can try again" loop ends in `loadingPhase: "idle"`
with `verificationStatus: "unavailable"`. The "Re-verify" button gate is opened up correctly
(`LeanCodeDisplay.tsx:111`) and there is a regression test (`OutputPanel.test.tsx:112-116` ensuring
`unavailable` does not show as `Verified`). This looks deliberate and correct.

The `verifyResultToStatus` helper accepts a structurally typed argument
(`{ valid: boolean; unavailable?: boolean }`) rather than `VerifyLeanResult`. That's a minor
inconsistency with the rest of the file (which uses named types) but it is also what allows
`leanRetryLoop`'s differently-shaped result to be passed in directly without a cast.

**Recommendation:** No change needed. Mentioning so the author can confirm "unavailable as terminal"
matches their model.

---

## What Looks Good

- **Backward-compatible response addition.** The new `unavailable` field on `VerifyLeanResult` is
  optional from the consumer perspective — the only added required-ness is in the new client type,
  which is internal. External shape change (mock `{ valid: true, mock: true }` → `{ valid: false,
  unavailable: true, reason }`) is necessary to fix the original bug (a missing verifier silently
  reading as "Verified") and is appropriately gated by the new `"unavailable"` UI state.
- **Naming follows conventions.** `unavailable`, `reason`, `detail`, the three `verifier-*` reason
  values, and the new `"unavailable"` `VerificationStatus` literal all match codebase casing and
  enum-literal style.
- **Status sanitization preserves persistence invariants.** `sanitizeVerificationStatus` strips
  unknown statuses to `"none"`, so a workspace persisted while the verifier was offline reloads as
  `"none"` rather than the stale `"unavailable"`. The new test (`workspacePersistence.test.ts:32-34`)
  pins this. Good defensive design — `"unavailable"` is correctly modeled as a runtime/transient
  state, not an artifact-state.
- **Retry loop short-circuit.** `leanRetryLoop` correctly does not retry on `unavailable` — the
  proof was never checked, so retrying would just burn LLM calls without changing the outcome
  (`leanRetryLoop.ts:73-77`).
- **UI symmetry.** Three UI surfaces (`VerificationBadge`, `LeanCodeDisplay` banner, `Re-verify`
  button) are updated together and tested. The amber color treatment cleanly distinguishes
  "unavailable" from both green-valid and red-invalid.
- **Server-side error envelope unchanged.** The 400 `{ error: "leanCode is required" }` validation
  path is preserved, so the existing convention (per-route `{ error }` envelope at 4xx) is intact.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | `unavailable` JSDoc understates: verifier-error path also sets it | Minor | `api.ts:104-109` | Medium |
| 2 | `reason`/`detail` on server response dropped by `verifyLean()` client | Inconsistent | `api.ts:120-132` + `route.ts:5-14` | High |
| 3 | Verifier-error path drops upstream error body | Inconsistent | `route.ts:45-49` | High |
| 4 | Wire format permits contradictory `valid`/`unavailable` combinations | Minor | `route.ts:7-14`, `api.ts:115-118` | Medium |
| 5 | Stale README and ARCHITECTURE docs | Inconsistent | `README.md:84,92`, `ARCHITECTURE.md:200-205` | High |
| 6 | `LoadingPhase` not extended (intentional, worth confirming) | Informational | `session.ts:2` | Low |

---

## Overall Assessment

This branch is **largely consistent** with the codebase's API conventions. The naming, casing, enum
literal style, and overall response shape all align with sibling routes. The biggest semantic change
— surfacing "verifier did not check this proof" as a distinct UI state rather than silently mocking
"Verified" — is the right call and is implemented coherently across the route, the client helper,
the type system, the retry loop, the persistence layer, and three UI surfaces. The fact-check
report's verified findings reinforce that the implementation behavior matches the inline
documentation.

The findings above are **fixable in place** and none are breaking for external consumers (there are
no external consumers of `/api/verification/lean` other than `verifyLean()` in this repo). The most
consequential finding is **#2** — the server emits a typed `reason` enum that the client throws
away — which is purely a missed opportunity for richer UI copy, not a correctness issue. **#5**
(stale README/ARCHITECTURE) is the only finding that affects users today and is required by the
project's documentation-maintenance rule in CLAUDE.md.

The author appears to have read the surrounding code: error envelopes match, naming conforms,
persistence is treated correctly (sanitize-to-none), and the retry-loop integration is thoughtful.
A consumer writing new code against `verifyLean()` after this branch will get a stricter and more
honest contract than before.
