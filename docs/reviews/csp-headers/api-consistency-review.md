# API Consistency Review — `feat/csp-headers`

**Commit:** d90d6bb40ae285df709c089f6babd337f6c4d22c
**Repository:** meta-formalism-copilot
**Branch:** `feat/csp-headers`
**Scope:** `git diff origin/main...HEAD` (`proxy.ts` new, `app/layout.tsx` modified)
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/csp-headers/code-fact-check-report.md` (12 claims, 7 verified, 1 incorrect)

A code-fact-check report was provided and is incorporated where relevant.

---

## Baseline Conventions

The "API surface" introduced by this branch is the **HTTP boundary of the Next.js application** — response headers seen by browsers and an internal request header (`x-nonce`) used to thread state from the proxy to server components. There is also a file-level convention question: which file name (`proxy.ts` vs `middleware.ts`) and module shape Next.js 16 expects.

Surveying the repo for analogous patterns:

1. **No prior middleware/proxy file exists.** `find -maxdepth 2` shows `proxy.ts` is the first file of its kind in the repo; there is no legacy `middleware.ts`. So the file-naming convention is being established by this PR, not migrated.
2. **No prior global response-header convention.** `next.config.ts` is empty (no `headers()` block), and grep across `app/` finds no other code that sets cross-cutting response headers. The only response-header usage in API routes is `Content-Type` (`app/api/verification/lean/route.ts:23`) and the SSE header bundle (`SSE_HEADERS`, used in `app/api/decomposition/extract/route.ts:127` and `app/api/formalization/lean/route.ts:119`).
3. **No prior internal-header convention.** Grep for `x-` in `app/` returns only the new `x-nonce` reference. There is no existing custom-header naming style in the repo to be consistent with — but lowercase, hyphenated, `x-`-prefixed names are the universal HTTP/RFC 7230 convention and what the Next.js docs themselves use.
4. **Next.js 16 file convention.** The bundled docs (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`) show: file name `proxy.ts` at project root (or under `src/`), exported function literally named `proxy`, optional `export const config = { matcher: ... }`. The version-history table records the rename from Middleware → Proxy in v16.0.0. `package.json` pins `next: 16.2.4`, so `proxy.ts` is correct for this version.
5. **Canonical CSP-with-nonce pattern.** `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md:44-87` is the reference template the diff is clearly based on. The matcher block at `:147-153` matches the diff's matcher byte-for-byte except for whitespace.
6. **Consumer of `x-nonce`.** Per the docs (`:347-381`), the canonical consumer pattern is `(await headers()).get('x-nonce')` inside a server component, then passing it to `<Script nonce={nonce} />`. No such consumer exists on this branch.

The "baseline" here is therefore mostly Next.js's own documented conventions, since the repo has no prior art. The relevant question becomes: does this diff match the framework conventions the next maintainer will encounter when reading the docs?

---

## Findings

### 1. Request-side `Content-Security-Policy` header is not set on forwarded request (deviates from Next.js docs example)

**Severity:** Inconsistent
**Location:** `proxy.ts:41-47`
**Move:** #1 (baseline conventions), #7 (asymmetry between request and response)
**Confidence:** Medium

The canonical Next.js CSP example sets the CSP header on **both** the forwarded request headers and the response headers (`content-security-policy.md:67-83`). The diff sets it only on the response. In practice this is fine for the in-tree consumers (Next.js's own bootstrap-script tagging works off the response header per Claim 12 of the fact-check), but a server component or third-party RSC integration that tries to read `Content-Security-Policy` via `(await headers())` will not see it. The `x-nonce` request header is sufficient for the documented `<Script nonce={...}>` pattern, so this is unlikely to cause a problem today — but it is a deviation from the Next.js example consumers may have copy-pasted from elsewhere.

**Recommendation:** Either match the docs and `requestHeaders.set("Content-Security-Policy", csp)` as well, or add a short comment explaining the intentional omission. A one-line set is the lower-friction fix.

---

### 2. `x-nonce` request header is set but has no consumer in this branch

**Severity:** Informational
**Location:** `proxy.ts:42`, `app/layout.tsx:31`
**Move:** #3 (consumer contract)
**Confidence:** High

The proxy forwards `x-nonce` to server components (correct per Next.js docs `:67-68, :347-381`). However, no consumer reads it. `app/layout.tsx` calls `await headers()` only as a side-effect to force dynamic rendering (Claim 11 of the fact-check) — it does not read `x-nonce` and does not render any `<Script>` element. The internal protocol described in the proxy comment ("layouts can read it via `headers()` and pass it to `<Script>` tags they render") is correctly described, but the contract has no party on the other end yet.

This is fine — Next.js's automatic nonce tagging on framework bootstrap scripts (Claim 12) is what actually delivers security value here. But a future reader may be confused about the purpose of `x-nonce` since nothing consumes it. The fact-check Claim 9 also flagged this as "latent usage."

**Recommendation:** Add a one-line comment at `proxy.ts:39-40` noting that the `x-nonce` request header is provisioned for future `<Script>` integrations (e.g., analytics, third-party scripts) and is not currently consumed. This avoids the next maintainer assuming the header is dead code and removing it.

---

### 3. Comment on `app/layout.tsx:27-28` misstates the mechanism

**Severity:** Minor
**Location:** `app/layout.tsx:27-31`
**Move:** #3 (consumer contract — documentation drift)
**Confidence:** High

This is the same issue the fact-check raised under Claim 11. The comment says `await headers()` makes "proxy.ts run on every request," but the proxy already runs on every matching request regardless. The actual reason `await headers()` is necessary is that **Next.js only injects the per-request nonce into bootstrap scripts during dynamic rendering**; statically prerendered pages have no per-request nonce (`content-security-policy.md:181, :391`). The comment conflates two independent mechanisms.

For an API-consistency review specifically, this matters because the comment is part of the **internal contract documentation** between the proxy and the layout. A future reader who trusts the comment may, e.g., remove `await headers()` after refactoring proxy logic and silently break the nonce flow.

**Recommendation:** Reword along the lines of: "Force dynamic rendering so Next.js injects the per-request CSP nonce into framework bootstrap scripts. Static pages are generated at build time and have no per-request headers, so the proxy's nonce can't be applied."

---

### 4. `Buffer.from(crypto.randomUUID())` produces a low-entropy nonce — copies a docs antipattern

**Severity:** Minor
**Location:** `proxy.ts:37`
**Move:** #1 (baseline conventions — note the convention is questionable)
**Confidence:** Medium

The Next.js docs example at `content-security-policy.md:48` uses exactly this construction. The branch follows that template. However, base64-encoding a UUID string (e.g. `"a1b2c3d4-..."`) wraps a 36-character ASCII representation of a 122-bit value — the result has 122 bits of entropy but is also a recognizable structure that a defender-in-depth reviewer may flag. The CSP3 spec recommends ≥128 bits of cryptographic randomness; the OWASP guidance is "at least 128 bits, base64-encoded directly from random bytes."

This is an "is the convention right?" finding rather than a "does this match the codebase?" finding — the codebase has no other nonces. I flag it because the skill's move #1 says baselines should be evaluated, not blindly inherited, when establishing a new convention. **The Next.js docs themselves are imperfect here.**

**Recommendation:** Consider `Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64")` instead. Equivalent length, higher entropy, more conventional. Optional; the current code is what the Next.js docs suggest. If left as-is, no change needed.

---

### 5. Comment on `proxy.ts:35-36` claims Edge runtime; per Next.js 16, Proxy is Node.js

**Severity:** Minor
**Location:** `proxy.ts:35-36`
**Move:** #3 (documentation drift)
**Confidence:** High

This is the fact-check's Claim 8 (verdict: Incorrect). The runtime attribution in the comment is wrong — Next.js 16 Proxy defaults to the Node.js runtime, and setting a `runtime` config in a proxy file is an error. The code itself runs correctly because `Buffer` and `crypto.randomUUID()` exist in both runtimes; only the attribution is misleading. Same class of issue as finding #3: it's part of the implicit contract documentation that future readers will rely on.

**Recommendation:** Change the comment to "available in the Node.js runtime that Next.js 16 Proxy uses" or simply "available in Node 18+."

---

### 6. CSP header value is constructed inline but no test pins the header shape

**Severity:** Informational
**Location:** `proxy.ts:19-32`
**Move:** #3 (consumer contract)
**Confidence:** Medium

`buildCsp` is the contract that every page response now satisfies. There is no test asserting that, e.g., `script-src` contains `'strict-dynamic'`, or that `frame-ancestors 'none'` is present — both load-bearing security properties. The repo uses Vitest extensively elsewhere; a contract test on this function (input: a known nonce; output: a stable directive string) would protect against accidental deletion of a directive during future edits.

**Recommendation:** Add `proxy.test.ts` that snapshots `buildCsp("test-nonce")` and individually asserts each directive's presence. Optional but cheap.

---

### 7. `connect-src 'self'` will block client-to-third-party calls if any are added later

**Severity:** Informational (forward-looking)
**Location:** `proxy.ts:26`
**Move:** #6 (versioning impact — silent breaking change for future code)
**Confidence:** High

Today this is correct: the fact-check verified Anthropic and OpenRouter calls are server-to-server (Claim 5). However, `connect-src 'self'` is a tripwire — if a future PR adds, e.g., a client-side fetch to `https://api.openalex.org/...` (the comment mentions OpenAlex as a possibility), the request will silently fail with a CSP violation in the browser console rather than a clean error. This is a usability problem for the next contributor.

**Recommendation:** No code change needed today. Consider documenting in `docs/decisions/NNN-csp-headers.md` (the project convention per `CLAUDE.md`) that adding any browser-originated third-party fetch requires updating `connect-src` in `proxy.ts`. A grep-friendly comment near `connect-src` referring to that decision record would close the loop.

---

## What Looks Good

- **File name and shape match Next.js 16 conventions.** `proxy.ts` at repo root, exported `proxy(request)` function with `NextRequest`/`NextResponse` types, and `export const config = { matcher: [...] }` — all canonical for Next 16.2.4.
- **Header names are conventional.** `x-nonce` is lowercase, hyphenated, `x-`-prefixed — matches both RFC 7230 norms and the exact spelling used in the Next.js docs.
- **Matcher shape is the canonical Next.js example.** The negative-lookahead exclusion of `api|_next/static|_next/image|favicon.ico` plus the `missing` clause for prefetch headers mirrors `content-security-policy.md:147-153` exactly.
- **The internal protocol is the canonical Next.js pattern.** Setting a custom request header in the proxy and reading it via `headers()` in a server component is documented at `content-security-policy.md:347-381`. The branch is using the framework's own contract, not inventing one.
- **Header-name casing is HTTP-correct.** `Content-Security-Policy` uses canonical casing in the response; `x-nonce` is lowercase on the request side. This matches both HTTP norms and the Next.js docs.
- **API routes are correctly excluded from the CSP scope.** `api|...` exclusion in the matcher means JSON endpoints are not burdened with browser-context CSP processing — correct for routes that emit JSON or SSE rather than HTML.

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | CSP not set on forwarded request headers (deviates from Next.js docs example) | Inconsistent | `proxy.ts:41-47` | Medium |
| 2 | `x-nonce` request header has no consumer in this branch | Informational | `proxy.ts:42`, `app/layout.tsx:31` | High |
| 3 | Comment on `layout.tsx` misstates why `await headers()` is needed | Minor | `app/layout.tsx:27-31` | High |
| 4 | UUID-as-nonce is lower-entropy than spec-recommended random bytes | Minor | `proxy.ts:37` | Medium |
| 5 | Comment claims Edge runtime; Next 16 Proxy is Node.js | Minor | `proxy.ts:35-36` | High |
| 6 | No test pins the CSP header contract | Informational | `proxy.ts:19-32` | Medium |
| 7 | `connect-src 'self'` is a future tripwire for browser-originated calls | Informational | `proxy.ts:26` | High |

---

## Overall Assessment

This change is **well-aligned with the framework conventions it's establishing**. The repo has no prior `proxy.ts`/`middleware.ts`, no prior CSP work, and no prior cross-cutting response-header convention, so there is little to be inconsistent *with* in the codebase itself. Measured against Next.js 16's own documented patterns — which is what a future maintainer will compare it to — the file structure, exported function shape, matcher syntax, header naming (`x-nonce` lowercase), and request-header forwarding are all canonical.

The substantive findings are almost entirely **documentation/contract issues**, not protocol issues:
- Three comment inaccuracies (findings #3, #5, and a sub-issue of #1) that future readers will rely on.
- One symmetry deviation from the docs example (finding #1: CSP not on the request side) that has no consumer impact today.
- One latent contract — `x-nonce` is provisioned but unused (finding #2) — which the next contributor needs to know about.

The two informational findings (#6 testing, #7 future `connect-src` tripwire) are about preserving the contract over time, not about its current shape.

There is no breaking change for any current consumer. The browser is the consumer here, and the response headers it will see (`Content-Security-Policy: ...`) are well-formed and follow the canonical Next.js example. Recommend addressing findings #3 and #5 (one-line comment fixes) before merge; #1, #2, #4, #6, #7 are optional polish.
