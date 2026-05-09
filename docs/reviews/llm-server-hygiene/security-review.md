# Security Review — feat/llm-server-hygiene

Commit: f2f149bbe3518128e19d8e38613936f967e55a5b
Branch: feat/llm-server-hygiene
Base: origin/main
Reviewer: security-reviewer skill (standalone)

> ⚠️ **No code fact-check report provided.** Claims about security properties in
> comments and documentation have not been independently verified by a separate
> fact-check pass. The caller-supplied note that the SSE protocol JSDoc at
> `streamLlm.ts:68-71` is stale (still documents `{ error, details }` while the
> emit site sends only `{ error }`) is incorporated below and treated as a
> verified finding. All other behavioral claims were spot-verified against the
> actual code.

## Scope

Files changed on the branch:

- `app/api/edit/artifact/route.ts` (+5 / -1)
- `app/lib/llm/callLlm.ts` (+12 / -9)
- `app/lib/llm/streamLlm.ts` (+12 / -12)
- `app/lib/llm/callLlm.test.ts` (+55, new file — test only)

The branch has two commits:
1. `7c799cc refactor: per-call Anthropic client + tighten error logging`
2. `f2f149b refactor: tighten errorWithDetails JSDoc to describe present behavior`

This is a hardening change. The intent is to (a) stop a stale Anthropic client
from outliving an API-key rotation, and (b) keep provider error bodies and LLM
output out of server logs because they may echo user content / source material.
The review focuses on the four areas the caller flagged.

## Trust Boundary Map

The diff sits squarely on the boundary between **untrusted client / external
provider data** and **server-side persistence (logs, analytics file, cache)**.

Inputs entering the server:
- HTTP request bodies (`content`, `instruction`, `selection`) at
  `app/api/edit/artifact/route.ts:25-29` — fully attacker-controllable.
- Provider response bodies from Anthropic and OpenRouter — semi-trusted: they
  are returned by a vetted upstream, but a known property of LLM APIs is that
  their error messages frequently echo back parts of the request payload (so
  treating them as low-trust w.r.t. PII is correct).

Outputs leaving the server:
- `console.error` / `console.warn` / `console.log` — go to Vercel runtime logs,
  which are durable and broadly accessible inside the project's observability
  surface.
- SSE `event: error` payloads — go to the end user that initiated the request.
- JSON response bodies on 4xx/5xx — go to the same end user.
- Analytics persistence (`appendAnalyticsEntry`) — writes only fixed-shape
  numeric/categorical metadata (provider, model, tokens, cost, latency,
  timestamp, randomUUID); no prompts, no responses, no keys. Confirmed by
  reading `callLlm.ts:84-89` and `streamLlm.ts:46-58`. Out-of-scope for this
  diff but relevant context.
- Cache (`setCachedResult`) — writes the model output text plus usage. This is
  a long-standing trust boundary, unchanged by this diff.

The per-call Anthropic client also constitutes a **secret-lifecycle boundary**:
the API key flows from `process.env` → `makeAnthropicClient` → SDK instance,
and now no longer survives across requests in module scope.

## Findings

### Stale SSE protocol JSDoc still documents `details` field

**Severity:** Low
**Location:** `app/lib/llm/streamLlm.ts:68-71`
**Move:** #3 (error path), #1 (trust boundary documentation)
**Confidence:** High

The JSDoc block above `streamLlm` documents the SSE error event as
`{ error: "message", details: "..." }`, but the actual emit site at
`streamLlm.ts:162` sends only `{ error: message }` after this branch's
hardening. This is documentation drift, not a runtime bug, but it is
security-relevant because future contributors reading the protocol comment
may believe `details` is part of the contract and re-add it on the wire,
re-introducing the very leak this branch is closing. The other JSDoc block
(at `streamLlm.ts:25-29`) already correctly notes the omission, so the two
comments now contradict each other.

**Recommendation:** Update the protocol JSDoc to read
`event: error — { error: "message" }` and add a short note that `details` is
deliberately not transmitted because provider error bodies may echo request
content. Single-line fix.

### Provider error body still surfaced verbatim to clients via OpenRouterError in non-streaming routes

**Severity:** Low
**Location:** `app/api/edit/artifact/route.ts:88-93`, plus
`app/api/edit/whole/route.ts:37`, `app/api/edit/inline/route.ts:29`,
`app/api/refine/context/route.ts:54`, `app/api/formalization/lean/route.ts:145`,
`app/api/explanation/lean-error/route.ts:38`
**Move:** #1 (trust boundary), #3 (error path)
**Confidence:** High

The branch tightens *server-side logging* of OpenRouter error bodies in
`callLlm.ts:180-188` — good. But the body is still attached to
`OpenRouterError.details` and every consuming route handler still spreads it
into the JSON response:

```ts
return NextResponse.json(
  { error: err.message, details: err.details },
  { status: 502 },
);
```

The same pattern exists in `app/api/edit/artifact/route.ts:91`. So if the
threat model that justifies suppressing the body in logs ("provider error
bodies can echo parts of the request") is correct, then echoing the body
straight back in the HTTP response is at most a partial mitigation: it keeps
plaintext off the log volume but still ships it over the wire to whoever
holds the session. For the artifact-edit route specifically, `responseText`
is also echoed back as `details: responseText.slice(0, 500)` on the
JSON-validation error path (line 83), with a comment justifying it as
"the caller originated the request and needs it to debug their input."

This is consistent (caller sees their own data) but the consistency is
worth making explicit in a follow-up: the threat model should distinguish
"don't put user content in **server logs** because they fan out to operators
and aggregators" from "don't put user content in the **HTTP response** to
the user who sent it." The current branch implicitly takes that position
but never states it. Out of scope to fix here; flagging so the next
hardening pass doesn't accidentally walk it back.

**Recommendation:** Add a short comment in `callLlm.ts` near the
`OpenRouterError` definition stating the policy ("details may be returned
to the originating caller but must not be logged"), so callers don't have
to re-derive it. Optionally, in a future change, scrub or truncate
`err.details` at the route boundary before returning.

### `errorWithDetails` is now a one-call helper whose payload is never read

**Severity:** Informational
**Location:** `app/lib/llm/streamLlm.ts:30-34`, called once at line 265
**Move:** #6 (follow the secrets — applied to error data flow)
**Confidence:** High

After removing `getErrorDetails`, the only producer of an Error with a
`details` property in this file is `errorWithDetails`, and the only consumer
inside the module previously was the catch-block log/SSE emit, which the
diff just stopped reading. So `details` is now write-only within the file:
the property is attached to a thrown Error object and never inspected by
anything in `streamLlm.ts`. The JSDoc claims "any in-process consumer that
opts in to reading it" might use it, but I could not find such a consumer
on the streaming path — `streamLlm` is invoked from streaming routes, and
those handlers receive only the SSE stream, not the thrown error.

This is not a vulnerability today. The risk it creates is **forward
compatibility**: a future change could add a generic Express/Next error
handler that reflects unhandled error properties into the response (e.g.
serializing `err` directly), at which point the dormant `details` field
would silently leak the OpenRouter body. The shorter the path between
"data attached to error" and "data on the wire," the safer.

**Recommendation:** Either delete `errorWithDetails` and throw a plain
`Error(message)` (since nothing reads `details` on the streaming path), or
add an in-tree consumer that justifies the JSDoc claim. If it's kept for
parity with `OpenRouterError`, document explicitly that the field is
intentionally dead on the streaming path and must remain so.

### Per-call Anthropic client construction — verification

**Severity:** Informational (no finding; verification note)
**Location:** `app/lib/llm/callLlm.ts:14-16, 133`; `app/lib/llm/streamLlm.ts:207`
**Move:** #6 (follow the secrets)
**Confidence:** High

I checked for residual module-scope credential caching:

- No remaining references to `_anthropicClient`, `anthropicClient`, or any
  module-level `let`/`const` holding an `Anthropic` instance (verified with
  ripgrep over `app/`).
- `makeAnthropicClient` is a pure constructor with no closure state.
- Both call sites (`callLlm.ts:133`, `streamLlm.ts:207`) read
  `process.env.ANTHROPIC_API_KEY` immediately before constructing the client
  (`callLlm.ts:111`; `streamLlm.ts:84` passes through to
  `streamAnthropic(opts.apiKey)`).
- The new test at `app/lib/llm/callLlm.test.ts:40-54` asserts that a key
  rotation between calls reaches the constructor — this is a useful
  regression guard and the assertion is correctly tight (it checks the exact
  sequence `[key-A, key-B]`, not just "constructed twice").

One small note: the SDK module import (`import Anthropic from
"@anthropic-ai/sdk"`) is still cached by Node's module loader, which is fine
— that caches the class, not credentials. There is no residual credential
caching in this codebase after the change.

### Mock-fallback warning includes env-var names — acceptable

**Severity:** Informational
**Location:** `app/lib/llm/callLlm.ts:206`, `app/lib/llm/streamLlm.ts:136`
**Move:** #6
**Confidence:** High

Both warning lines name the expected env vars (`ANTHROPIC_API_KEY`,
`OPENROUTER_API_KEY`). This is a developer-experience message and discloses
nothing sensitive — env-var **names** are not secrets, only their **values**
are. Confirmed that no code path in the diff (or in `callLlm.ts` /
`streamLlm.ts` more broadly) logs the key value itself. Including this only
to confirm the cognitive-move-#6 sweep is complete.

### Test mutates shared `process.env` without restoration

**Severity:** Informational
**Location:** `app/lib/llm/callLlm.test.ts:37-49`
**Move:** #4 (TOCTOU-style hygiene applied to test isolation)
**Confidence:** Medium

`beforeEach` deletes `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` from
`process.env` and the test then sets `ANTHROPIC_API_KEY = "key-A"` then
`= "key-B"`. There is no `afterEach`/`afterAll` that restores prior values.
In Vitest with default isolation per test file this is usually fine, but if
the suite is ever run with `--no-isolate` or in a worker pool that reuses
the process across files, a later test that reads `process.env` could see
"key-B" or undefined, leading to flaky security-relevant tests (e.g. a test
that relies on the mock-fallback path being taken when no key is set).

This is not exploitable, just a test-stability note.

**Recommendation:** Snapshot and restore the original env in
`beforeEach`/`afterEach`, or use `vi.stubEnv` which restores automatically.

## What Looks Good

- **Removal of module-scope client cache.** Eliminates a class of bugs where
  rotating `ANTHROPIC_API_KEY` had no effect until next process restart, and
  also eliminates the pin-once-per-process anti-pattern that complicates
  multi-tenant credential rotation. The accompanying test pins the contract.
- **Switching `console.error` from logging the raw OpenRouter `errorBody` to
  logging only `status` + `endpoint`** at `callLlm.ts:186` — this is the
  right call. Provider error bodies are a known echo vector for prompt /
  source content and frequently include the offending portion of the
  request. Keeping them out of durable logs is meaningful PII hygiene.
- **Symmetric tightening on the streaming path** — `streamLlm.ts:160`
  drops both the message-suffix log of `details` and the SSE forwarding of
  `details`. The new comment correctly states the rationale.
- **Edit/artifact route's invalid-JSON branch** correctly logs only the
  `responseText.length` rather than the content. The companion comment
  (`route.ts:77-80`) explicitly distinguishes "don't log" from "OK to return
  to caller" — this is the right framing and should be lifted to a project
  convention.
- **No API-key value is logged anywhere** in the diff. The error logs name
  the env-var keys when they're absent (which is fine) but never emit the
  value when they're present.
- **The per-call client doesn't widen any other trust boundary.** The key
  is still pulled from `process.env` only (no caller-supplied keys), it's
  still scoped to the function frame, and the SDK instance is GC'd after
  the call. No shared state, no cross-request leakage.
- **The new test** asserts both the count and the order of constructor
  calls. A weaker assertion (e.g. `toHaveBeenCalledTimes(2)`) would have
  passed even if a singleton snuck back via lazy init on key change. Good
  test design for a regression guard.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Stale SSE protocol JSDoc still documents `details` field | Low | `app/lib/llm/streamLlm.ts:68-71` | High |
| 2 | OpenRouter error body still echoed to clients via `OpenRouterError.details` (out of diff scope; policy clarification needed) | Low | `app/api/edit/artifact/route.ts:88-93` (+ 5 sibling routes) | High |
| 3 | `errorWithDetails` payload now write-only on streaming path; risks future accidental leak | Informational | `app/lib/llm/streamLlm.ts:30-34, 265` | High |
| 4 | Per-call Anthropic client — no residual credential caching (verification only) | Informational | `app/lib/llm/callLlm.ts:14-16, 133` | High |
| 5 | Mock-fallback warning names env vars — acceptable | Informational | `app/lib/llm/callLlm.ts:206` | High |
| 6 | Test mutates `process.env` without restoration | Informational | `app/lib/llm/callLlm.test.ts:37-49` | Medium |

## Overall Assessment

This is a clean, narrowly-scoped hardening change and it accomplishes what it
sets out to do: provider error bodies and LLM output no longer flow into
server logs, and the Anthropic client no longer pins an API key for the
process lifetime. The four caller-flagged questions all resolve favorably:
no key/PII/request-body leakage in the new error-logging path, no residual
module-scope client, the SSE error event correctly emits only `{ error }`,
and the artifact route logs only length on the invalid-JSON branch.

The single most important thing to address is the **stale JSDoc at
`streamLlm.ts:68-71`** — it's a one-line fix and leaving it in place
materially increases the chance that a future contributor re-adds the
`details` field to the wire format. Everything else is informational or
out-of-scope context for the next hardening pass (notably: the policy
question of whether `OpenRouterError.details` should keep flowing through
to HTTP responses in the sibling routes; the branch implicitly takes a
"yes, callers see their own data" position that's worth stating explicitly
somewhere).

No critical or high-severity issues. No escalation patterns matched. The
change is safe to merge once the JSDoc is corrected.
