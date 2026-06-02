# Test Strategy: corpus S3 — isomorphic-git commit/push/pull pipeline in a worker

**Scope:** the new `app/lib/corpus/` S3 modules — `gitFs.ts` (iso-git-fs shim over `CorpusFS`), `gitCore.ts` (the plain testable git logic: init/commit/log/status/push/pull over an injected iso-git-fs + http), `gitProtocol.ts` (typed worker request/response + `toWorkerError` reification), `gitWorkerClient.ts` (main-thread `CorpusGit` proxy over a transport), and the `CorpusGit` interface (added to `types.ts` or a new `git.ts`).
**Reviewed:** 2026-06-01

## Test Conventions
Vitest 4 (`vitest run`), jsdom env but **Node `fs`/`os`/`path` available** in tests. Colocated tests in `app/lib/corpus/__tests__/*.test.ts`. Shared fakes (`inMemoryCorpusFs.ts`, `fakeFsaHandle.ts`) + a shared contract suite (`corpusFsContract.ts`) proving substitutability. Pattern: arrange-act-assert; fault injection via fakes; `vi.useFakeTimers()` for backoff; structural witnesses (e.g. "returns a Promise") where the real substrate is absent in jsdom. Real OPFS/FSA/worker/network deferred to out-of-CI smokes. iso-git's git LOGIC IS runnable in CI against a Node tmpdir (the Node spike already did this) — so S3's `gitCore` is tested with REAL iso-git, not a mock.

## Untested Paths Touched by the Change

(Gaps enumerated against the planned implementation; line ranges are post-implementation targets, named by module + behavior since the code is written test-first.)

- **G1** `gitFs.ts` — `readFile`/`writeFile` delegating to `CorpusFS` with iso-git's `{ encoding }` option (utf8 vs raw bytes) — not covered
- **G2** `gitFs.ts` — `readdir` returning names (iso-git expects sorted name list; `CorpusFS.readdir` already sorts) — not covered
- **G3** `gitFs.ts` — `mkdir` synthesized as a no-op (CorpusFS has implicit dirs; iso-git calls `mkdir` for `.git/` subdirs and must not throw) — not covered
- **G4** `gitFs.ts` — `rmdir`/`unlink` → `CorpusFS.rm`; idempotent on missing — not covered
- **G5** `gitFs.ts` — `stat`/`lstat` returning the `{ type:"file"|"dir", mode, size, mtimeMs, ino, ... isFile()/isDirectory() }` shape iso-git requires (CorpusFS.stat only gives `{size}`; a path that is a dir prefix must stat as a directory) — not covered
- **G6** `gitFs.ts` — `stat` on a missing path throws an `ENOENT`-shaped error (iso-git branches on `err.code==="ENOENT"`); a `CorpusFS` `null` must become the ENOENT throw, not a returned null — not covered
- **G7** `gitCore.init` — initializes a repo at the corpus root over the shim; `.git/` appears in the underlying FS — not covered
- **G8** `gitCore.commit` — add-all + commit returns a sha; a second commit after a file change returns a different sha; author/committer set — not covered
- **G9** `gitCore.commit` — committing with no changes (empty tree delta) behaves predictably (returns prior sha or a typed no-op signal) — not covered
- **G10** `gitCore.log` — `{ depth }` bounds the returned entry count (cliff mitigation); returns `{ entries, nextCursor }` — not covered
- **G11** `gitCore.log` — `{ filepath, depth, cursor }` paginates: page 2 continues from `nextCursor` and does not re-return page 1 — not covered
- **G12** `gitCore.log` — `{ filepath }` on a file with N commits returns only commits that touched that file (F6 provenance) — not covered
- **G13** `gitCore.status` — `statusMatrix`-derived status reports modified/added/deleted vs HEAD — not covered
- **G14** `gitCore.push`/`pull` — auth failure (`onAuth`/401) reifies to `CorpusError {kind:"remote-auth-expired"}`, NOT a generic io error — not covered
- **G15** `gitCore.pull` — a file changed on both sides triggers the conflict path → `CorpusError {kind:"git-conflict", path}` (v1 last-write-wins detection) — not covered
- **G16** `gitProtocol` — `toWorkerError` round-trips every `CorpusErrorKind` raised by gitCore so the discriminated kind survives `postMessage` (structured-clone-safe; no class instances) — not covered
- **G17** `gitProtocol` — an UNTYPED throw inside the worker handler is caught and wrapped into a `CorpusWorkerError` (never an unhandled rejection crossing the boundary; DD-009 §Failure-driven) — not covered
- **G18** `gitWorkerClient` (proxy) — `{ ok:false, error }` response is reconstructed into a thrown `CorpusError` with the original `detail.kind` on the main thread — not covered
- **G19** `gitWorkerClient` — `{ ok:true, result }` resolves with the result; request/response correlation by id (concurrent requests don't cross responses) — not covered
- **G20** `CorpusGit` interface — is SEPARATE from `CorpusFS` (no git methods land on `CorpusFS`; the in-memory fake still satisfies `CorpusFS` with no git stubs) — not covered
- **G21** flag / wiring — S3 modules are reachable only behind `isCorpusEnabled()`; the flag-OFF localStorage path and S1 characterization test are unchanged — not covered (verified by re-running S1 suite, not a new test)

## Recommended Tests

#### gitFs shim — node-fs surface over CorpusFS
**Closes gaps:** G1, G2, G3, G4, G5, G6
**Type:** unit + contract
**Priority:** high
**File:** `app/lib/corpus/__tests__/gitFs.test.ts`
**What it verifies:** the shim presents iso-git's required `fs.promises` surface faithfully over a 5-method `CorpusFS`.
**Key cases:**
- `writeFile("x", bytes)` then `readFile("x")` round-trips raw bytes; `readFile("x",{encoding:"utf8"})` returns a string.
- `mkdir("a/b")` does not throw and a subsequent `writeFile("a/b/c")` works.
- `stat` on a written file → `isFile()===true`, `size` correct; `stat` on a dir prefix → `isDirectory()===true`.
- `stat`/`lstat` on a missing path throws `err.code==="ENOENT"`.
- `unlink`/`rmdir` on a missing path is idempotent (no throw).

**Setup needed:** `createInMemoryCorpusFs()` as the backing FS.

#### gitCore — real iso-git against a Node tmpdir
**Closes gaps:** G7, G8, G9, G10, G11, G12, G13
**Type:** integration (real iso-git, no mock)
**Priority:** high
**File:** `app/lib/corpus/__tests__/gitCore.test.ts`
**What it verifies:** commit/log/status work with real `isomorphic-git`, and `log` pagination bounds the result (the 3000-commit-cliff mitigation).
**Key cases:**
- `init` then `commit` returns a 40-char sha; a second commit after editing a file returns a different sha.
- `commit` with no changes returns a typed no-op (or prior sha) without throwing.
- create 5 commits each touching `artifacts/semiformal/v000N.md`; `log({filepath, depth:2})` returns exactly 2 entries + a `nextCursor`; a second call with that cursor returns the next 2 and never repeats page 1.
- `log({filepath})` for one file returns only commits touching it, not the whole history.
- `status` reports an added/modified/deleted file vs HEAD.

**Setup needed:** `node:fs` + `node:os.tmpdir()` (cleaned in `afterEach`); run iso-git directly on `node:fs` for perf-shaped realism AND once over the `gitFs` shim+in-memory FS for substrate parity.

#### gitCore — remote auth + conflict typed-error mapping
**Closes gaps:** G14, G15
**Type:** unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/gitCore-errors.test.ts`
**What it verifies:** remote-auth and conflict failures reify to the EXISTING typed kinds, never generic io.
**Key cases:**
- inject an `http` client / `onAuth` that yields a 401 → `push`/`pull` rejects `CorpusError` with `detail.kind==="remote-auth-expired"`.
- simulate a both-sides change (two divergent commits on the same path, then merge/pull) → rejects/returns `{kind:"git-conflict", path}`; assert `path` is the conflicted file.

**Setup needed:** a fake `http` plugin (returns 401) and a fake/stub merge driver, or a local tmpdir with two clones to produce a real divergence; inject so no network is needed.

#### gitProtocol — typed-error reification across the boundary
**Closes gaps:** G16, G17
**Type:** unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/gitProtocol.test.ts`
**What it verifies:** no untyped throw crosses `postMessage`; every kind survives structured clone.
**Key cases:**
- for each `CorpusErrorKind` gitCore can raise, `toWorkerError` produces a plain object with `__corpusError:true` and the same `detail.kind` (structured-clone-safe — `JSON.parse(JSON.stringify(x))` preserves it).
- the worker handler catches a raw `Error("boom")` and returns `{ ok:false, error }` where `error` is a `CorpusWorkerError` (wrapped to `{kind:"io"}`), not a rethrow.

**Setup needed:** call the handler dispatch function directly (the worker's message handler factored as a plain function so no real `Worker` is needed).

#### gitWorkerClient — main-thread proxy reconstruction + correlation
**Closes gaps:** G18, G19, G20
**Type:** unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/gitWorkerClient.test.ts`
**What it verifies:** the proxy reconstructs typed errors and correlates concurrent requests.
**Key cases:**
- a fake transport returning `{ ok:false, error: <CorpusWorkerError git-conflict> }` makes the proxy method reject a `CorpusError` whose `detail.kind==="git-conflict"`.
- a fake transport returning `{ ok:true, result }` resolves with `result`.
- two in-flight requests with distinct ids resolve to their own responses (no cross-talk).
- type-level: importing `CorpusGit` and a `CorpusFS` fake shows the fake needs no git methods (assert at runtime that `createInMemoryCorpusFs()` has no `commit`).

**Setup needed:** a fake transport object (`{ post(req), onMessage(cb) }`) — no real `Worker` (jsdom has none).

## What NOT to Test
- **The real `Worker` spawn + real OPFS-backed git + real remote push/pull round-trip** — jsdom has no `Worker`/OPFS/network. Covered by `docs/spikes/corpus-git-smoke.md` (out-of-CI), NOT claimed as CI-tested. (G21's real-env half, and the real-transport half of G18/G19.)
- **iso-git's own correctness** (it has its own suite + two spikes) — we test our integration, not iso-git internals.
- **The Buffer polyfill under Turbopack** — verified by `npm run build` being green, not a unit test (Node has native Buffer).
- **commit-on-write store wiring** — deferred to the plan's decision; if not wired in S3, nothing to test (S4 owns logical save boundaries).

## Coverage Gaps Beyond Current Scope
**1.** The real remote round-trip (clone/push/pull against GitHub/GitLab over HTTP) is unmeasured in CI and only sketched in the smoke — a pre-launch verification item (carried from both spikes' "what the spike did NOT answer").
**2.** Safari/WebKit worker + OPFS behavior — still a pre-launch item (Playwright WebKit doesn't run on WSL2).
**3.** Background-tab throttling of the worker's push backoff — observable only in a real long-running browser session.

## Summary
The highest-value test is **gitCore against a real Node tmpdir** (G7–G13): it exercises real iso-git commit/log/status and proves the `log` pagination that mitigates the 3000-commit cliff — the one place spike headroom is thin. The second tier is the typed-error boundary (G14–G19): proving conflicts and auth failures reify to the existing `git-conflict`/`remote-auth-expired` kinds and survive `postMessage` is what makes DD-009's "no silent fallback" real. The main residual risk after this plan is the un-CI-testable trio (real worker + real OPFS + real remote), explicitly pushed to the smoke. Open question surfaced by the gap walk: the exact `stat` shape iso-git requires from the shim (G5/G6) is the most fragile integration point and is verified both by the shim unit tests and by running real iso-git over the shim.
