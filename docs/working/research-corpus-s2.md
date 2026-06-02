# Research: DD-009 corpus S2 — FSA folder mirror + folder-pick UX

- **Goal**: Implement DD-009's opt-in, user-visible FSA folder as the source-of-truth mirror — an FSA-backed `CorpusFS`, an async OPFS→FSA mirror-on-write with retry/backoff, read-path fallthrough (OPFS empty → read FSA) for browser-storage-clear recovery, and a folder-pick + permission flow — all behind the existing default-off corpus flag, without disturbing the localStorage default or S1's committed behavior.
- **Problem framing**: S1 shipped the always-on OPFS working copy as a `CorpusFS` behind a flag, but it is blob-mode, single-substrate, and (S1 review finding C4) the store's storage seam is async + un-debounced and zustand does not await it, so a failed corpus write is a silently-dropped floating promise — exactly the silent fallback DD-009 §Failure-driven forbids. S2 adds the second substrate (FSA) and the composite/mirror layer that is the natural home for the sync-ack/retry seam that closes C4 (without building the "saved" UI, which is S5). Considered and discarded: "make `CorpusFS` itself retry-aware" — rejected, retry/mirror is a composition concern over two `CorpusFS` instances, not a property of the leaf adapter (keeps the OPFS/FSA adapters and the in-memory fake simple and substitutable).
- **Project state**: branch `feat/corpus-fsa-mirror` off `feat/corpus-architecture` (S1, not yet merged to main) · second of the S0–S5 sub-tasks; depends on S1, blocks nothing (S3 git pipeline is independent and can proceed in parallel) · not blocked (S1 contracts are settled and committed) (cite: docs/working/decomposition-corpus-architecture.md §Sub-tasks S2).
- **Task status**: in-progress (research drafted; plan to follow; implementation test-first behind the flag).

## What exists

### S1's `app/lib/corpus/` module (the seam S2 binds to)
- **`types.ts`** — `CorpusFS` (async, bytes+paths: `readFile→Uint8Array|null`, `writeFile`, `readdir→string[]`, `rm` idempotent, `stat→{size}|null`). Single substrate-neutral `CorpusErrorKind` source feeds both thrown `CorpusError` and serializable `CorpusWorkerError`. **`fsa-permission-revoked` and `browser-storage-cleared` kinds already exist** — S2 raises them, does not add them. `quota-exceeded` carries `substrate: "opfs"|"fsa"|"remote"`. `assertNever` enforces exhaustive handling. Git is explicitly NOT on `CorpusFS` (separate `CorpusGit` interface in S3). [observed — types.ts:34-125]
- **`opfsAdapter.ts`** — the FSA adapter's structural template: `getRoot()` SSR/unavailable guard → typed `{kind:"unavailable"}`; `splitPath` defense-in-depth traversal rejection; `walkDir` (re-resolves the chain per op — S1 review C3); `wrap()` maps DOMException quota/not-found to typed errors. [observed — opfsAdapter.ts:50-185]
- **`storeAdapter.ts`** — `resolveWorkspaceStorage()` returns the zustand `StateStorage`: `createDebouncedLocalStorage()` (default, byte-for-byte the prior behavior) or `createCorpusBackedStorage(createOpfsCorpusFs())` when `isCorpusEnabled()`. The seam is typed `CorpusFS`. **This is S2's single wiring point**: when a folder is connected, the injected `CorpusFS` must become the mirror composite instead of bare OPFS. [observed — storeAdapter.ts:55-79]
- **`flag.ts`** — `isCorpusEnabled()`: hard `NODE_ENV==="production"` guard (returns false), then `NEXT_PUBLIC_CORPUS_FS==="1"` env, then `localStorage["corpus-fs-enabled"]==="1"`. Default-off, dev-only. **S2 stays entirely behind this; do not relax the production guard.** [observed — flag.ts:15-32]
- **`paths.ts`** — the only source of corpus paths (`stateBlobPath`, `workspaceDir`, `artifactVersionPath`, …) + `workspaceSlug`/`safeSegment` traversal choke point. S2 reuses these unchanged (the FSA adapter takes already-built relative paths, exactly like the OPFS adapter). [observed — paths.ts]
- **`manifest.ts`** — fail-loud `workspace.json` codec. Not touched by S2 (S4 wires the folder layout). [observed]

### S1's test infrastructure (S2 reuses verbatim)
- **`corpusFsContract.ts`** — `defineCorpusFsContract(label, makeFs)`: the shared suite every `CorpusFS` must pass (null-on-missing, 256-byte round-trip, nested-dir create+readdir, rm idempotent, 30-files access pattern, overwrite-in-place). The FSA adapter is held to this suite against a **fake `FileSystemDirectoryHandle`** (jsdom has no FSA). [observed]
- **`inMemoryCorpusFs.ts`** — `createInMemoryCorpusFs()` Map-backed fake. The mirror is tested with **two** of these (primary + mirror). [observed]
- **`opfsAdapter.test.ts`** — the fake-handle technique S2 copies: `setStorage({getDirectory: async () => fakeRoot})` with a recursive fake dir handle (`getFileHandle`/`getDirectoryHandle`/`removeEntry`/`async *keys()`). The FSA fake handle is the same shape minus the `navigator.storage` wrapper. [observed — opfsAdapter.test.ts:52-104]

### S1 review items S2 carries forward (code-review-rubric.md 🟢)
- **C3** — `walkDir` re-resolves the full directory chain per op; becomes O(files×depth) round-trips under S4's files-per-artifact layout. S2's FSA adapter has the same shape; **decision (see plan): keep the simple per-op walk in S2** (mirror writes are async/off the UI path; handle caching is a cross-adapter perf refactor better done once in S3/S4 when the files-per-artifact access pattern actually lands). Documented, not silently dropped.
- **C4** — async un-debounced seam → failed write is a dropped floating promise. **S2 closes the surfacing half of C4**: the mirror exposes a `getMirrorStatus()`/ack surface and raises a typed error on mirror failure rather than swallowing. The store-side `await`/debounce integration is noted for S5 (the status UI consumer); S2 makes the signal *exist and be truthful*. [observed — code-review-rubric.md C3/C4]

### Stack / availability
- Next.js `^16.2.6`, React `19.2.6`, Zustand `^5.0.13`, Vitest `^4.1.6` + jsdom. **No FSA in jsdom** (no `showDirectoryPicker`, no `FileSystemDirectoryHandle`) — exactly like OPFS. **No new dependency needed**: FSA is a browser API; handle persistence (optional) uses IndexedDB (also a browser API). [observed — package.json; research-corpus-architecture.md §Dependencies]

## Invariants (must not break)
- **S1 OFF path byte-for-byte**: `createDebouncedLocalStorage` and the flag-OFF route must be untouched; the S1 characterization test + flag-routing test must still pass. S2 only adds a *third* branch inside the flag-ON path (folder connected → mirror), never changes OFF. [observed — plan-corpus-s1.md Rollback]
- **SSR safety**: no `window`/`showDirectoryPicker`/`FileSystemDirectoryHandle`/IndexedDB access during render. The FSA adapter guards like the OPFS adapter (`typeof window`/handle presence → typed `{kind:"unavailable"}`); the picker is only ever called from a user gesture (event handler), never at module load or render. [observed — opfsAdapter.ts:50-56; research-corpus-architecture.md Invariants]
- **No silent fallback** (DD-009 §Failure-driven): a mirror-to-FSA failure or a permission loss must surface via the mirror ack/status AND a typed error, never a swallow. Read-path fallthrough (OPFS empty → FSA) is the ONE allowed fallthrough and it is a *recovery* path, not an error-hiding path — it still surfaces nothing misleading. [observed — DD-009:37-38, 94]
- **Single error-kind source**: any new failure kind goes only in `types.ts` `CorpusErrorKind`. `fsa-permission-revoked` already exists — S2 must not mint a parallel kind. [observed — types.ts:41-49]
- **Git stays out of `CorpusFS`**: S2 adds no git; the mirror composes two `CorpusFS` instances. [observed]
- **Production guard stays**: `flag.ts`'s `NODE_ENV==="production"` short-circuit is load-bearing (S1 security C2); S2 does not touch it. [observed — flag.ts:19-21]
- **File-size + colocated-tests + conventional-commit** project conventions. No module under `app/` may be named `layout`/`page`/`route`/`template`/`default`/`loading`/`error`/`not-found` (Next.js reserved). [observed — corpus-fs-seam.md Gotchas]

## Prior art
- **The OPFS adapter is the FSA adapter's blueprint** — same SSR guard, same `splitPath`/traversal rejection, same `walkDir`, same `wrap()` error mapping. FSA's handle API (`getFileHandle`/`getDirectoryHandle`/`removeEntry`/`values()`/`getFile()`/`createWritable()`) is near-identical to OPFS's; the main differences: FSA's root is a *passed-in* `FileSystemDirectoryHandle` (from the picker) not `navigator.storage.getDirectory()`, and FSA can throw `NotAllowedError`/`SecurityError` on permission loss (→ `fsa-permission-revoked`). [observed — opfsAdapter.ts]
- **The shared contract suite is the substitutability proof** — running `defineCorpusFsContract` against the FSA adapter (over a fake handle) holds it to identical behavior, exactly as S1 did for the in-memory fake. [observed — corpusFsContract.ts]
- **The OPFS smoke spike is the manual-verification template** — `docs/spikes/corpus-opfs-smoke.md` documents the out-of-CI Playwright/manual gate for the success path jsdom can't run. S2 mirrors it for the FSA picker + real-folder flows. [observed]
- **Stale-closure caution** — `docs/thoughts/page-tsx-refactor.md` warns the async write-path callbacks must use refs/current-value passing, not closed-over state. Relevant because the mirror enqueues async retries; the mirror holds its own queue state internally (not via React closures), sidestepping this. [observed — research-corpus-architecture.md Prior art]
- **iso-git pre-mortem narrative #4** (docs/spikes/isomorphic-git-perf-50mb.md:73) is the DD-009-level pre-mortem for exactly S2's failure: "FSA permission silently revoked across browser restart → 'saved' indicator lies." Its mitigation (ack tied to FSA-mirror enqueue, not OPFS commit) IS S2's mirror-ack design. S2 references this rather than re-running /pre-mortem. [observed]

## Gotchas

Failure-pattern grep: no matches found

- **jsdom has NO FSA.** No `showDirectoryPicker`, no `FileSystemDirectoryHandle`, no `FileSystemFileHandle`. The FSA adapter's success path is unverifiable in Vitest — test it via the shared contract suite against a **fake handle** (Map-backed, same shape as the OPFS test's `fakeRoot`), and the picker via a stubbed `window.showDirectoryPicker`. Do NOT claim the real browser FSA flow is CI-tested. [inferred from OPFS parity; opfsAdapter.test.ts]
- **FSA permission is revocable across page loads.** A persisted `FileSystemDirectoryHandle` (IndexedDB) survives a reload but its permission grant may not — `queryPermission()` can return `"prompt"`, and a write then throws `NotAllowedError`/`SecurityError`. This must map to `{kind:"fsa-permission-revoked"}`, not a generic io error, so the (S5) status UI can prompt re-grant. [inferred — MDN FSA permission model; DD-009 failure narrative #4]
- **`showDirectoryPicker` requires a user gesture** and rejects with `AbortError` if the user cancels. Cancel is NOT an error to surface as a failure — it's a no-op (folder stays disconnected). Distinguish `AbortError` (user cancel → resolve "not connected") from `NotAllowedError`/`SecurityError` (permission denied → typed error). [inferred — MDN]
- **OPFS write-ack ≠ durable; FSA-mirror enqueue-ack is the truthful save signal** (research Gotchas; DD-009 sync-ack contract). The mirror must expose the *enqueue/flush* ack, and a failed/stale mirror downgrades the (future S5) indicator — S2 makes the ack truthful but ships no indicator. [observed — research-corpus-architecture.md:58; decomposition §sync-ack]
- **Handle persistence is the optional/risky part.** Persisting a `FileSystemDirectoryHandle` needs IndexedDB (structured-clone of the handle) and re-query/re-request of permission on load. If scoped out of S2, the cost is "re-pick the folder each session" — acceptable for a dev-only flag. **Decision (plan): persist the handle in IndexedDB but require an explicit reconnect/permission re-grant on load** (no silent auto-grant — auto-grant is impossible anyway; browsers require a gesture to re-request). [inferred — MDN; DD-009 degraded modes]
- **Background-tab throttling** (Chromium ~1Hz) slows the mirror retry cadence in a backgrounded tab — the retry/backoff must be tolerant (bounded retries, not a tight loop), and the ack reflects reality (pending), not optimism. [observed — research-corpus-architecture.md:61]
- **C3 walk cost** — the FSA adapter inherits OPFS's per-op directory re-resolution; under S4's files-per-artifact layout this is O(files×depth). Not an S2 blocker (S2 is blob-mode like S1; the mirror copies whole files), flagged for the S3/S4 cross-adapter handle-cache refactor. [observed — code-review-rubric.md C3]

## Open design questions for the plan
- **Mirror granularity in blob-mode**: S1 store writes one blob file (`state/workspace-zustand-v1.json`). The mirror in S2 therefore mirrors that single blob OPFS→FSA on each `writeFile`. The per-artifact-file mirror granularity only matters once S4 wires the folder layout; S2's mirror is correct for both because it operates at the `CorpusFS` op level (any path). Confirm: mirror operates per-`writeFile`/`rm`, not per-blob-semantics. [resolve in plan]
- **Read fallthrough scope**: DD-009 says "OPFS empty → read FSA." Define "empty" at the *per-path* level (a `readFile` that returns `null` from OPFS retries the FSA mirror) vs the *corpus* level. Per-path is simpler, composes with the existing `CorpusFS` contract, and is the natural recovery for a single blob. **Decision (plan): per-path fallthrough on `readFile`/`stat`/`readdir`.** [resolve in plan]
- **Retry policy**: bounded exponential backoff (e.g. 3 attempts, 100/300/900ms), then mark the mirror status `failed` + raise/record the typed error; do not retry forever (background-throttle + battery). [resolve in plan]
- **Whether S2 ships any UI**: optional per the brief. Lean: ship the picker *logic* module + a tiny optional affordance is acceptable but the adapter+mirror+picker logic is the deliverable; the status *indicator* is S5. [resolve in plan]

## Files read
Last verified: 2026-06-01
Relevant paths: app/lib/corpus/, app/lib/stores/workspaceStore.ts, docs/decisions/009-artifact-corpus-architecture.md, docs/working/decomposition-corpus-architecture.md
docs/decisions/009-artifact-corpus-architecture.md
docs/working/decomposition-corpus-architecture.md
docs/working/research-corpus-architecture.md
docs/working/plan-corpus-s1.md
docs/working/checkpoint-corpus-s1.md
docs/working/test-strategy-corpus-s1.md
docs/reviews/code-review-rubric.md
docs/thoughts/corpus-fs-seam.md
docs/spikes/corpus-opfs-smoke.md
docs/spikes/isomorphic-git-perf-50mb.md
app/lib/corpus/types.ts
app/lib/corpus/opfsAdapter.ts
app/lib/corpus/storeAdapter.ts
app/lib/corpus/flag.ts
app/lib/corpus/paths.ts
app/lib/corpus/manifest.ts
app/lib/corpus/__tests__/corpusFsContract.ts
app/lib/corpus/__tests__/inMemoryCorpusFs.ts
app/lib/corpus/__tests__/corpusFs.contract.test.ts
app/lib/corpus/__tests__/opfsAdapter.test.ts
app/lib/stores/workspaceStore.ts (persist wiring)
package.json
