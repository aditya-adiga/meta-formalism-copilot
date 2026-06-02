# Security Review — DD-009 S3 (feat/corpus-git-pipeline)

**Scope:** `git diff feat/corpus-architecture..feat/corpus-git-pipeline -- app/` plus the `package.json`/`package-lock.json` dependency adds. S1 code and `docs/` excluded.
**Commit:** `20a68f81fb863e8b7d69ede643606c4c3b0da399`
**Date:** 2026-06-01
**Context:** Client-side, single-tenant Next.js app. The git pipeline runs in a Web Worker. Remote is user-configured (their own GitHub/GitLab/self-hosted). Behind a default-off, production-guarded dev flag; commit-on-write and real remote wiring are deferred to S4/S5.

> ⚠️ **No code fact-check report provided.** Claims about security properties in comments and docstrings (e.g. "the typed error survives the boundary", "this assignment doesn't leak") were read against the code directly but not independently verified by the code-fact-check skill.

No escalation patterns matched. No plaintext secrets, no disabled TLS, no injection sink, no hardcoded keys. Proceeding with the structured review.

## Trust Boundary Map

```
B1: [main thread postMessage payload]   → [self.onmessage cast as GitRequest]   → [handleGitRequest dispatch + gitCore]   (new)
B2: [worker postMessage response]        → [worker.onMessage → reconstruct()]   → [new CorpusError thrown on main thread]  (new)
B3: [git remote credentials via onAuth]  → [git.push/git.pull onAuth callback]  → [iso-git HTTP Basic auth header]         (new)
B4: [iso-git path args (dir + ".git/…")] → [rel() normalizer in gitFs]          → [CorpusFS byte read/write on OPFS]       (new)
B5: [remote git server HTTP responses]   → [iso-git wire parser + diff3 merge]  → [OPFS working tree / .git objects]       (new)
B6: [npm registry: iso-git + 24 transitive] → [worker bundle]                    → [executes in worker scope]               (new)
```

Within this single-tenant model, the conventional "untrusted user input" boundary is weak — the operator who configures the remote and triggers commits is the same person the deployment trusts. The boundaries that still carry real weight are: **B2** (a serialized error object crossing `postMessage` and being reconstructed into a live object — prototype-pollution / reification surface), **B3** (credentials handed to a remote and potentially echoed in errors that cross B2 into UI), **B5** (data fetched from a *remote git server*, which is more-trusted-than-arbitrary but still a network peer that can return hostile packfiles/refs), and **B6** (the new runtime dependency surface — the initiative's first runtime deps). B1 and B4 are low-risk here because the only message sender is the app's own composition root and paths are app-constructed, not user-typed.

## Findings

#### Worker reconstructs `CorpusError` from an unvalidated `error` payload (reification trust gap)

**Severity:** Low
**Location:** `app/lib/corpus/gitWorkerClient.ts:42-52`; depends on `app/lib/corpus/types.ts:52-71`
**Boundary:** B2
**Move:** #7 (serialization boundary), #1 (trust boundary)
**Confidence:** Medium

`reconstruct(res.error)` does `new CorpusError(e.detail, e.message)` directly from whatever arrives on the response channel, with no shape check — it does not call `isCorpusWorkerError` (which exists in `types.ts:73` precisely for this) nor validate that `detail.kind` is a known kind. In the intended design the only sender is the trusted worker, so this is not exploitable today. But the worker's `error` field is typed `unknown` at the wire (`GitResponse.result: unknown`), and `CorpusError`'s constructor stores `detail` and feeds `message` to `super()`. A malformed or hostile `detail` (e.g. `kind` not in the union) would produce a `CorpusError` whose `detail` later hits `describeCorpusError`/`assertNever` and throws `unhandled corpus error kind`, turning a git failure into an uncaught render-time throw downstream. There is no prototype-pollution vector here — `new CorpusError(...)` assigns to a fixed `detail` property and does not merge attacker keys into a prototype — so the realistic impact is a denial-of-render, not pollution. Note the same applies symmetrically: `gitWorker.ts:71` casts `ev.data as GitRequest` with no validation, so a malformed inbound message reaches the `switch` and falls to the `default` (typed io error) — which is the safe outcome, but a non-object message could throw before the try block in `handleGitRequest` is entered (it isn't — the cast is outside `handleGitRequest`'s try). See the related note below.

**Recommendation:** Gate `reconstruct` behind `isCorpusWorkerError(res.error)` and fall back to a synthetic `{kind:"io"}` `CorpusError` when the shape is unrecognized, so a malformed response degrades to a typed error rather than a thrown `assertNever`. Cheap defense-in-depth; makes the boundary self-describing even if a future second sender appears.

#### `gitWorker.ts` `onmessage` casts inbound messages without a discriminant check before dispatch

**Severity:** Low
**Location:** `app/lib/corpus/gitWorker.ts:70-79`
**Boundary:** B1
**Move:** #1 (trust boundary), #3 (error path)
**Confidence:** Medium

`self.onmessage` does `const msg = ev.data as GitRequest | GitWorkerInit` and branches on `(msg as GitWorkerInit).type === "__init__"`. If `ev.data` is `null`/a primitive, the `.type` access throws a `TypeError` *inside the onmessage handler but outside* `handleGitRequest`'s try/catch, producing an unhandled rejection in the worker — exactly the "silent failure DD-009 forbids" that `handleGitRequest` was written to prevent. The handler resolves the typed-error contract only for messages that successfully reach `handleGitRequest`; a structurally invalid message short-circuits that guarantee. In the single-tenant model the only sender is the app, so this is a robustness gap more than an attack, but it undermines the stated invariant.

**Recommendation:** Validate `ev.data` is a non-null object with a string `type` at the top of `onmessage`; on failure, `postMessage` a well-formed `{ok:false, error}` (id `-1` or echoed if present) instead of letting the access throw. This keeps the "every outcome is a typed response" contract total.

#### `onAuth` credential lifecycle is unspecified; error surfaced to UI must not echo the token

**Severity:** Informational (Low if S5 wires it carelessly)
**Location:** `app/lib/corpus/gitCore.ts:198-222` (push/pull); `gitCore.ts:65-89` (error mapping); deferred wiring in `gitWorker.ts:56-68`
**Boundary:** B3, B2
**Move:** #6 (follow the secrets)
**Confidence:** High (on the mapping behavior); the storage half is out of this diff

What this diff does right: on a 401/403 or a cancelled prompt, `mapGitError` returns a *bare* `{kind:"remote-auth-expired"}` with **no token, no URL, and no underlying message** (`gitCore.ts:87`). So the credential does not leak through the auth-failure path that crosses B2 to the UI. Good. The residual risk is the **`io` fallback** at `gitCore.ts:88`: any iso-git throw that is *not* recognized as auth or conflict is mapped to `{kind:"io", reason: e.message}`, and iso-git's `HttpError`/network errors can embed the **remote URL** in their message. If a user ever encodes credentials in the remote URL (`https://user:token@host/repo.git`) — a common and tempting pattern — that URL-with-token could land in `reason`, cross B2, and be rendered or logged by S5. The diff itself never stores or logs a credential, and `onAuth` is not even wired in `buildCore` yet (it's omitted from `deps`), so today there is nothing to leak.

**Recommendation:** (1) In S5, pass credentials *only* via `onAuth` (username/password), never embedded in `remoteUrl`, and document that constraint where the remote URL is accepted. (2) Consider scrubbing the `remoteUrl` substring (or any `://user:...@`) out of the `io` fallback `reason` before it crosses B2, so a misconfigured URL can't leak a token into the UI/console. (3) When S5 stores the token, prefer in-memory/session over `localStorage` (the CLAUDE.md notes the app already keeps provider keys in env, not in-browser — keep git creds equally out of persistent web storage).

#### `gitFs` path normalizer does not constrain traversal outside the corpus root

**Severity:** Informational
**Location:** `app/lib/corpus/gitFs.ts:77-89` (`rel`), used by every fs method
**Boundary:** B4, B5
**Move:** #1 (trust boundary), #2 (implicit sanitization)
**Confidence:** Medium

`rel()` strips a leading `dir` prefix and leading/trailing slashes but does **not** reject `..` segments. iso-git constructs the paths it passes (`${dir}/.git/...`, working-tree entry paths), so the inputs are not user-typed — that's why this is Informational, not a finding with an exploit. The path that *is* externally influenced is **B5**: a hostile/compromised remote returns a packfile whose tree contains entries with crafted filepaths (e.g. `../../escape`), and on `pull`/checkout iso-git would call `writeFile` with that path. The actual containment here is **CorpusFS/OPFS itself**, not `rel()`: OPFS resolves relative segments within the origin's storage root and cannot escape to the real filesystem, and a `..` that climbs above the corpus root would still be confined to the OPFS sandbox. So the blast radius of a malicious-remote path-traversal is "writes a file in an unexpected place inside this origin's OPFS," not host filesystem escape. Worth noting because S2 (the FSA folder *mirror*) changes this calculus: a real-folder mirror would give `..` traversal real teeth.

**Recommendation:** Add a `..`-segment rejection (throw `FsError("EINVAL")`) in `rel()` as cheap defense-in-depth before B5/B2 widen. This is low-cost insurance that becomes load-bearing when S2 mirrors to a real folder where `..` can escape the corpus directory.

#### [Dependency change] `isomorphic-git@^1.38.3` + `buffer@^6.0.3` add ~25 transitive packages as the initiative's first runtime deps

**Severity:** Low
**Location:** `package.json`, `package-lock.json`
**Boundary:** B6
**Move:** #10 (dependency review)
**Confidence:** Medium

The two manifest adds pull in (per the lockfile) ~25 packages: `isomorphic-git` itself plus `async-lock`, `clean-git-ref`, `crc-32`, `diff3`, `simple-get`/`decompress-response`/`mimic-response`/`simple-concat`, `sha.js`, `minimisted`/`minimist`, `pify`, `ignore`-adjacent helpers, `to-buffer`, `once`/`wrappy`, plus `buffer`'s `base64-js`/`ieee754`, and `events`/`process`/`abort-controller`/`event-target-shim` polyfills. Assessment:

- **isomorphic-git** is well-maintained, widely used (millions of weekly downloads), purpose-built for exactly this use, and pinned at a current minor (`1.38.3`). No major-version skip, no known critical advisory at this version range as of the pin. Reasonable choice; the alternative (lightning-fs's IndexedDB second store) was explicitly rejected per the design notes.
- **buffer** (feross) and its deps are the standard browser Buffer polyfill, ubiquitous and stable. Confined to worker scope by `gitWorker.ts:42-44`.
- The transitive set is small and consists of well-known micro-libs. Two things worth a glance, not a block: (a) `sha.js` is used here for git object hashing (content-addressing), **not** for any security/password purpose, so its fast-hash nature is correct-by-design — do not flag it as a weak-crypto issue. (b) `simple-get`/`decompress-response` perform the network fetch for push/pull — but in the browser worker, iso-git uses `isomorphic-git/http/web` (the `fetch`-based client imported at `gitWorker.ts:33`), so the node `simple-get` path is not the one exercised in production; it's pulled in transitively for the node entry. Confirm tree-shaking/bundling keeps the node http client out of the worker bundle.
- These are the *first runtime deps* of the corpus initiative (per CLAUDE.md), and they execute in worker scope where they have access to OPFS and `fetch` to the user's remote. That's the right containment, but it means a future supply-chain compromise of iso-git or a transitive would run with corpus-storage + remote-network reach. Acceptable for a single-tenant self-hosted app; note it as the trust assumption.

**Recommendation:** No blocker. (1) Confirm the production worker bundle ships only `isomorphic-git/http/web` and tree-shakes the node `simple-get` HTTP path. (2) Add iso-git + buffer to whatever dependency-update watch the project uses (Dependabot/Renovate) so the first runtime deps don't drift unpatched. (3) Record in the decision log that runtime deps are now contained to worker scope and why (worker isolation is the containment boundary).

## What Looks Good

- **Auth failure surfaces without leaking the token.** `mapGitError` returns a bare `{kind:"remote-auth-expired"}` with no message, URL, or underlying error attached (`gitCore.ts:87`). This is the single most important credential-hygiene property for B3→B2 and it's correct.
- **Total error reification at the worker boundary.** `handleGitRequest` resolves-never-rejects and reifies *every* throw into a structured-clone-safe `CorpusWorkerError` via `toWorkerError` (`gitProtocol.ts:62-104`), with an exhaustive `switch` whose `default` is a typed error rather than a silent no-op. The "no class instance crosses postMessage" discipline is sound.
- **Dependency injection keeps the worker thin and the logic testable.** `fs`/`http`/`dir`/`onAuth` are all injected (`gitCore.ts:42-57`); nothing hard-imports a global Worker or http client at module load, so SSR/jsdom never accidentally instantiates the network or worker surface.
- **Buffer polyfill is correctly scoped to worker global only** (`gitWorker.ts:42-44`), so the main bundle never carries it — smaller main-thread attack surface.
- **`sha.js` is used for content-addressing, not secrets** — no misuse of a fast hash for a password/credential purpose anywhere in the diff.
- **No `Math.random`, no timing-unsafe secret comparison, no plaintext credential, no disabled TLS** anywhere in the diff.

## Summary Table

| # | Finding | Severity | Boundary | Location | Confidence |
|---|---------|----------|----------|----------|------------|
| 1 | `reconstruct` rebuilds CorpusError from unvalidated payload | Low | B2 | `gitWorkerClient.ts:42-52` | Medium |
| 2 | `onmessage` casts inbound msg without discriminant check | Low | B1 | `gitWorker.ts:70-79` | Medium |
| 3 | `onAuth` lifecycle / io-fallback may echo token-in-URL (S5) | Info→Low | B3, B2 | `gitCore.ts:88,198-222` | High |
| 4 | `rel()` path normalizer permits `..` (OPFS-contained today) | Info | B4, B5 | `gitFs.ts:77-89` | Medium |
| 5 | [Dependency change] iso-git + buffer add ~25 runtime deps | Low | B6 | `package.json` / lockfile | Medium |

## Overall Assessment

For a default-off, single-tenant, worker-isolated git pipeline, the security posture is good and the change is mergeable. The boundary that mattered most — credentials crossing the worker→UI error channel — is handled correctly: auth failures surface as a bare typed kind with no token attached. There are no Critical/High findings, no escalation patterns, and no architectural problem; every finding is fixable in place. The single most important thing to address is **finding #3's forward-looking constraint**: when S5 wires `onAuth` and remote-URL input, credentials must travel only through `onAuth` (never embedded in the remote URL), and the `io`-fallback `reason` should be scrubbed of any `://user:...@` substring before it crosses B2 — otherwise a misconfigured remote URL could leak a token into the rendered/ logged error. Findings #1 and #2 are cheap defense-in-depth that make the worker's "every outcome is a typed response" invariant actually total. The dependency add is reasonable and well-contained to worker scope; just keep iso-git + buffer on an update watch and confirm the node HTTP path is tree-shaken out of the worker bundle.

---

**Goal-Alignment Note:** This review was produced under the stated goal — security gate before opening the DD-009 S3 PR. It is calibrated to the client-side, single-tenant model with a user-configured remote: the "untrusted user" boundary is intentionally down-weighted, and the review concentrates on the worker message boundary, credential handling at the remote-auth path, the iso-git fs shim's traversal surface, and the supply-chain delta — the four priorities named in the dispatch. Nothing here blocks opening the PR; the one finding worth carrying into the S4/S5 implementation is the credential-in-URL leak path (finding #3).
