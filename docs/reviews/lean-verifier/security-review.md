# Security Review — Lean Verifier Graceful Degradation

**Commit:** c95c9cb50d1a3634e655700f1b6c768a6774fe9b
**Branch:** `feat/lean-verifier-graceful-degradation`
**Scope:** `git diff origin/main...HEAD` (10 files; primary surface is `app/api/verification/lean/route.ts`)
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/lean-verifier/code-fact-check-report.md` (used as foundation; behavior claims independently confirmed where security-relevant)

---

## Trust Boundary Map

The changed code spans one trust boundary that matters and a handful of internal data flows that don't.

1. **Untrusted client → Next.js route (`POST /api/verification/lean`).** A browser (or any HTTP client — there is no auth middleware on this route, consistent with all other API routes in the project) sends `{ leanCode: string }`. The route validates only the type/non-empty of `leanCode`. The request body is not used in any sensitive sink inside Next.js itself; it is forwarded as a JSON body to the verifier.
2. **Next.js route → external Lean verifier service.** The route reads `LEAN_VERIFIER_URL` from the operator-controlled environment, appends `/verify`, and POSTs `{ leanCode }`. The verifier URL is treated as trusted infrastructure (operator-set). The verifier's response body, when 2xx, is parsed as JSON and forwarded as-is to the client.
3. **Verifier response → Next.js route → client.** On 2xx the upstream JSON is forwarded verbatim through `NextResponse.json(data)`. On non-2xx, the route now substitutes a structured `unavailable` envelope and discards the upstream body. On network/timeout/DNS errors the catch substitutes another structured envelope.
4. **Internal flows (client hooks/components).** `verifyResultToStatus` collapses the response into a four-valued `VerificationStatus` rendered in the UI. No new sinks are introduced; the new "unavailable" branch only renders static copy plus a `Re-verify` button.

What this branch *changes* about the trust model:

- It **removes** the silent mock-pass on fetch failure (`{ valid: true, mock: true }`). That removal is a security improvement: a passing badge is no longer reachable via "verifier service down."
- It **removes** the previous default of `http://localhost:3100`. The route now refuses to fetch anything if `LEAN_VERIFIER_URL` is unset. This narrows the SSRF/loopback surface compared to main: previously a deployed instance with an unset env var would always emit a localhost request; now it does nothing.
- It **changes** the verifier-error path to discard the upstream body and return a fixed envelope, which slightly reduces the surface for verifier-shaped responses to leak through.

---

## Findings

No Critical, High, or Medium severity findings. Two Low/Informational notes follow.

#### SSRF surface comes from the operator-trusted env var, not user input — but the URL is concatenated unchecked

**Severity:** Informational
**Location:** `app/api/verification/lean/route.ts:36`
**Move:** #1 (trust boundaries), #2 (implicit assumptions)
**Confidence:** High (description) / Low (exploitability)

The route builds the verifier URL via template literal: `` `${verifierUrl}/verify` ``. `verifierUrl` is `process.env.LEAN_VERIFIER_URL`, which is operator-controlled (not user-controlled), so this is not classic SSRF. However, the route does no validation on the env value: a misconfigured deploy that points `LEAN_VERIFIER_URL` at, say, `http://169.254.169.254` (cloud metadata service) or an internal admin endpoint will happily POST JSON there on every verify request. The blast radius is limited because (a) the request has a fixed `Content-Type` and `{ leanCode }` body shape, (b) only 2xx responses are forwarded to the client and they are re-serialized through `NextResponse.json`, and (c) the pre-branch behavior was strictly worse (it defaulted to a localhost URL). This is not a regression; flagging only because the diff is the natural place to add a sanity check if you want one.

**Recommendation:** Optional defense-in-depth: validate `LEAN_VERIFIER_URL` at startup (e.g. `new URL(verifierUrl)` with a check that the protocol is `http:`/`https:`) and log a clear error on misconfiguration. This is not required to ship.

#### Verifier 2xx body is forwarded to the client without shape validation

**Severity:** Informational
**Location:** `app/api/verification/lean/route.ts:51-52`
**Move:** #7 (serialization boundary), #2 (implicit assumptions)
**Confidence:** Medium

On the success path, `NextResponse.json(data)` forwards whatever JSON the verifier returned. The client (`verifyLean` in `app/lib/formalization/api.ts:120-128`) extracts only `valid`/`errors`/`unavailable` via explicit coercion (`Boolean(...)`, `?? ""`), so type-confusion in the renderer is bounded — a malicious or buggy verifier cannot inject a non-string into `errors` and have it rendered raw, because the client coerces. Two minor risks remain: (1) if the verifier returns `{ valid: true, unavailable: true }`, `verifyResultToStatus` correctly resolves to `"unavailable"` (precedence is right); (2) if the verifier ever adds large fields in its 2xx response, they pass through to the client unfiltered. Since the verifier is operator-trusted infrastructure, this is acceptable, but it's worth being aware that the route is a transparent passthrough on 2xx.

**Recommendation:** Optional: shape the success-path response explicitly (`return NextResponse.json({ valid: Boolean(data.valid), errors: typeof data.errors === "string" ? data.errors : "" })`) so the client contract is enforced server-side and the verifier's exact response shape is no longer load-bearing. Not necessary if you're comfortable treating the verifier as fully trusted.

#### Caller-supplied request body has no size limit

**Severity:** Low
**Location:** `app/api/verification/lean/route.ts:17`
**Move:** #8 (what if there are a million of these?)
**Confidence:** Medium

`await request.json()` will read and parse arbitrarily large bodies (subject to Next.js platform defaults — typically 4MB on Vercel, larger on self-hosted). The route then forwards the entire `leanCode` to the verifier in a fresh JSON serialize. An unauthenticated client can spam this endpoint with multi-MB payloads to cause CPU/memory pressure on both the Next.js process and the Lean verifier. This is **not introduced by this branch** — the same shape existed before — but the branch is the natural place to note that no rate limiting, payload size limit, or auth gates this endpoint (or any other route in the app, per the project's local/research-app posture).

**Recommendation:** No action required for this PR. If/when this app is deployed in a public/multi-tenant setting, consider a per-route size limit (`request.headers.get("content-length")` early reject) and rate limiting; track that as a separate issue.

---

## What Looks Good

- **Mock-pass removal is the right call.** Returning `{ valid: true, mock: true }` from the catch block previously meant a verifier outage was indistinguishable, on the wire, from a successful proof — and the original code stripped the `mock` flag in the client (`Boolean(data.valid)`), so the UI rendered "Verified." Replacing this with an explicit `unavailable` envelope is a security-relevant correctness fix, not just a UX improvement.
- **`unavailable` precedence over `valid` in `verifyResultToStatus`.** A bug here (e.g. checking `valid` first) would re-introduce the mock-pass class of issue at the type-system level. The function is short, well-commented, and ordered correctly.
- **Error path no longer forwards upstream body or status.** Previously `return NextResponse.json(data, { status: res.status })` would echo whatever the verifier returned on non-2xx — a malicious or compromised verifier could in principle return crafted content with arbitrary HTTP semantics. The new path returns a fixed envelope at HTTP 200 with `unavailable: true`. This is a small reduction in the verifier's ability to influence the client.
- **No internal error details leak.** The `catch {}` block is parameter-less — even the error message is not exposed to the client. The `verifier-error` reason includes only `HTTP ${res.status}` (an integer), which is not sensitive. The `detail` field is operator-defined, not derived from the upstream body.
- **Input validation on `leanCode`** is present (type + non-empty) and runs before any environment lookup or fetch.
- **`AbortController` + `setTimeout(35s)`** prevents a hung verifier from holding a Next.js function indefinitely. `clearTimeout` is correctly placed after `await fetch` resolves.
- **Persistence sanitizer updated.** `sanitizeVerificationStatus` maps `"unavailable"` to `"none"` (`workspacePersistence.test.ts:32-34`), preventing a stale localStorage value from being treated as a current verifier outage on reload. This is the correct call: `unavailable` is verifier-state, not artifact-state.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | SSRF surface from unvalidated `LEAN_VERIFIER_URL` (operator-trusted, not regression) | Informational | `app/api/verification/lean/route.ts:36` | High / Low (exploitability) |
| 2 | Verifier 2xx body forwarded to client without shape validation | Informational | `app/api/verification/lean/route.ts:51-52` | Medium |
| 3 | No request body size limit on the route (pre-existing pattern) | Low | `app/api/verification/lean/route.ts:17` | Medium |

Counts: **Critical 0, High 0, Medium 0, Low 1, Informational 2.**

---

## Overall Assessment

This change improves the security posture of the verification flow. The pre-branch mock-pass on fetch failure was a real correctness/integrity bug — a verifier outage rendered as a passing proof, and a network-MITM scenario could have produced the same outcome trivially. The new branch makes the three failure modes explicit, propagates them to the UI as `unavailable` (distinct from `valid`), and removes the silent localhost default URL. Error handling is conservative: the catch block exposes nothing, the verifier-error path discards the upstream body, and only an HTTP status integer ever crosses to the client.

The findings I noted are all defense-in-depth observations on pre-existing patterns (no auth, no rate limit, no startup URL validation), not regressions introduced by this branch. The single thing worth doing in-PR if you want to be tidy is shape-validating the 2xx success response server-side so the verifier's exact JSON shape is no longer load-bearing on the client (#2). Everything else is safe to ship.

The two stale documentation claims surfaced by fact-check (`README.md:84` describing a default URL; `docs/ARCHITECTURE.md:200-205` describing the mock fallback) are not security-relevant on their own, but worth fixing in this PR so the documented threat model matches the implemented one — a deployer reading the README and assuming the localhost default still applies could leave `LEAN_VERIFIER_URL` unset. The UI now surfaces this clearly via the offline banner, so the impact is degraded UX rather than silent unchecked proofs — the doc fix is informational, not security-critical.
