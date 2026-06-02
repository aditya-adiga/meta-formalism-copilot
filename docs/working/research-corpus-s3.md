# Research: DD-009 corpus S3 — isomorphic-git commit/push/pull pipeline (in a worker, behind the flag)

- **Goal**: Implement DD-009's cross-device-sync + provenance half — a `CorpusGit` interface (commit / lazy-paginated log / push / pull / status) backed by `isomorphic-git` running inside a dedicated Web Worker so its SHA1/zlib CPU bursts stay off the main thread, with typed errors reified across the worker boundary, conflict detection mapping to the existing `git-conflict` kind, all behind the existing default-off corpus flag and without disturbing S1's committed behavior.
- **Problem framing**: S1 shipped the always-on OPFS `CorpusFS` cache; S2 (parallel, independent) adds the FSA mirror + sync-ack. S3 is the third terminal stage of DD-009's single write pipeline (OPFS → FSA → **git remote**): it gives the corpus its `(repo-url, sha, path)` citability (F8), its `git log`/`diff`/`blame` provenance primitives (F6), and its cross-device sync. iso-git is CPU-heavy (SHA1 + zlib), so DD-009 + both spikes mandate it run in a worker; and `git.log({filepath})` has a measured 3000-commit cliff, so version-history reads must be lazy/paginated. Considered and discarded: putting git methods on `CorpusFS` — rejected by S1 arch-review finding 2 (ISP); git is a SEPARATE `CorpusGit` interface operating *over* a `CorpusFS`, so the in-memory fake and non-git consumers never stub git they don't use.
- **Project state**: branch `feat/corpus-git-pipeline` off `feat/corpus-architecture` (S1, not yet merged to main); third of the S0–S5 sub-tasks; depends on S0 layout + S1, **parallel-independent of S2** (branched off S1, not S2) · not blocked (S1 contracts settled + committed; both iso-git spikes complete with validated versions) (cite: docs/working/decomposition-corpus-architecture.md §Sub-tasks S3, §Implementation order).
- **Task status**: in-progress (research drafted; test-strategy + plan to follow; implementation test-first behind the flag).

## What exists

### S1's `app/lib/corpus/` module (the seam S3 binds to)
- **`types.ts`** — `CorpusFS` (async, bytes+paths). The single substrate-neutral `CorpusErrorKind` source feeds both thrown `CorpusError` and serializable `CorpusWorkerError`. **The `git-conflict {path}` kind and `remote-auth-expired` kind ALREADY EXIST** — S3 raises them, does not add them. `toWorkerError(err)` / `isCorpusWorkerError(v)` / the `CorpusWorkerError` type are ALREADY DEFINED for crossing a worker boundary; S3 is their first real consumer. `assertNever` enforces exhaustive handling. **`CorpusGit` is explicitly documented as a SEPARATE interface over `CorpusFS`** (types.ts:18-22, arch-review finding 2). [observed — types.ts:34-96]
- **`opfsAdapter.ts`** — `CorpusFS` over OPFS. The structural template for any leaf adapter (SSR/unavailable guard → typed error; `splitPath` traversal rejection; `walkDir`; `wrap()` quota/not-found mapping). S3's iso-git-fs shim, if chosen, mirrors this defensive shape. [observed]
- **`storeAdapter.ts`** — `resolveWorkspaceStorage(connectedMirror?)` returns the zustand `StateStorage`; the seam is typed `CorpusFS`. `resolveCorpusFs(connectedMirror?, primary?)` is the focused selection helper. **The seam being `CorpusFS`-typed is load-bearing for S3**: an eventual worker-proxy `CorpusFS` (if the corpus FS itself moves into the worker) drops in here without the store knowing — but S3's deliverable is `CorpusGit`, a sibling, not a `CorpusFS` swap, so S3 does not need to touch storeAdapter unless commit-on-write is wired (decision deferred to plan). [observed — storeAdapter.ts:82-115]
- **`flag.ts`** — `isCorpusEnabled()`: hard `NODE_ENV==="production"` guard, then `NEXT_PUBLIC_CORPUS_FS==="1"`, then `localStorage["corpus-fs-enabled"]==="1"`. Default-off, dev-only. **S3 stays entirely behind this; do not relax the production guard.** [observed — flag.ts:15-32]
- **`paths.ts`** — the only source of corpus paths + `workspaceSlug`/`safeSegment` traversal choke point. S3 reuses these unchanged (git operates on the on-disk tree the corpus already populates; iso-git's own `.git/` dir is at the corpus root, alongside `state/`, `workspaces/`, `settings.json`). [observed]
- **`manifest.ts`** — fail-loud `workspace.json` codec. Not touched by S3. [observed]

### S1's test infrastructure (S3 reuses)
- **`corpusFsContract.ts`** — `defineCorpusFsContract(label, makeFs)`: the shared suite every `CorpusFS` must pass. S3 needs an iso-git-compatible FS; **whatever FS iso-git runs on, if it is exposed as a `CorpusFS` it is held to this suite.** [observed]
- **`inMemoryCorpusFs.ts`** — Map-backed fake. Reusable as a substrate for testing the iso-git-fs shim if that route is chosen. [observed]
- The **fake-handle / fault-injection** technique (opfsAdapter.test.ts, fakeFsaHandle.ts in S2) is the model for testing the worker protocol without a real worker, and the git logic without a real remote. [observed]

### Stack / availability
- Next.js `^16.2.6` (**Turbopack is the default builder for `next build` in Next 16**; `next.config.ts` is currently empty — no custom webpack config), React `19.2.6`, Zustand `^5.0.13`, Vitest `^4.1.6` + jsdom. **Node APIs (`fs`, `os`, `path`) ARE available in vitest tests** (the test env is jsdom but runs on Node), so real iso-git against a tmpdir is CI-testable — exactly as the Node spike ran. [observed — package.json, vitest.config.ts]
- **No worker, no OPFS, no network in jsdom.** The real worker boundary, real OPFS-backed git, and real remote push/pull are NOT CI-testable; they go in an out-of-CI smoke (`docs/spikes/corpus-git-smoke.md`). [observed — corpus-fs-seam.md Gotchas; iso-git-browser-smoke.md]

### Spike-validated facts S3 carries forward
- **Versions**: `isomorphic-git@1.38.3` and (if lightning-fs route) `@isomorphic-git/lightning-fs@4.6.2` are the validated versions. [observed — iso-git-browser-smoke.md:30]
- **Buffer polyfill**: iso-git's browser/UMD build references `globalThis.Buffer`; the browser bundle needs the `buffer` polyfill. In Node/vitest `Buffer` is native, so CI doesn't need it. [observed — iso-git-browser-smoke.md:51,75; perf-characteristics.md:50]
- **`git.log({filepath})` 3000-commit cliff**: near-linear in commits-touching-the-file; ~4.2s Node / ~7s Chromium / ~12s Firefox at 3000. Eager unbounded log on mount hangs power users → MUST be lazy with `depth` + cursor pagination. [observed — perf-characteristics.md:36-46; isomorphic-git-perf-50mb.md:56]
- **iso-git `clone` is HTTP-only** (no `file://`); production cold-start needs `isomorphic-git/http/web`. Push pre-wire (`packObjects`) is sub-second; wire transfer is the dominant, network-bound push cost. [observed — isomorphic-git-perf-50mb.md:38,55]
- **Commit p50 ~13ms** Node and ~14ms Chromium — steady-state commit is cheap; first commit pays index-load setup. [observed — perf-characteristics.md]

## Invariants (must not break)
- **S1 OFF path byte-for-byte**: `createDebouncedLocalStorage` and the flag-OFF route untouched; the S1 characterization test + flag-routing test must still pass. S3 adds new modules + (at most) a flag-gated commit-on-write hook; it never changes the OFF path. [observed — plan-corpus-s1.md Rollback]
- **`CorpusGit` is a SEPARATE interface from `CorpusFS`** — no git methods on `CorpusFS` (S1 arch-review finding 2, ISP). The seam fake and non-git consumers must not have to stub git. [observed — types.ts:18-22]
- **Typed errors cross the worker boundary**: reuse `CorpusErrorKind` / `toWorkerError` / `isCorpusWorkerError` from `types.ts`. git conflict → `{kind:"git-conflict", path}`; remote auth failure → `{kind:"remote-auth-expired"}`. **Never let an untyped throw cross the worker `postMessage` boundary** (DD-009 §Failure-driven: silent fallback disallowed). Extend `CorpusErrorKind` ONLY via its single source in `types.ts` and only if a genuinely new kind is needed (prefer reusing existing kinds). [observed — types.ts:41-49; decomposition §CorpusWorkerError]
- **Lazy-paginated `git.log`**: expose log with `depth` + cursor; never an eager unbounded log. The 3000-commit-cliff mitigation. [observed — spikes]
- **Stay behind the flag; default-off; never enable in production** (`flag.ts` already guards `NODE_ENV==="production"`). [observed — flag.ts:19-21]
- **Storage seam stays `CorpusFS`-typed** — if a worker-proxy `CorpusFS` is introduced it drops into `resolveCorpusFs`/`storeAdapter` without the store knowing. Don't break that typing. [observed — storeAdapter.ts]
- **SSR safety**: no `Worker`/OPFS/network access during render or module load. The worker is spawned only from a client gesture / effect, never at import time. [observed — opfsAdapter SSR guard pattern]
- **File-size + colocated-tests + conventional-commit** conventions. **No module under `app/` may be named** `layout`/`page`/`route`/`template`/`default`/`loading`/`error`/`not-found`/`global-error`/`middleware`/`instrumentation` (Next.js reserved). `worker` is NOT a reserved App Router filename, but the worker file is named `gitWorker.ts` (unambiguously safe) and the build is verified. [observed — corpus-fs-seam.md Gotchas]
- **Reproducibility / conflict v1**: a commit is citable by `(repo-url, sha, path)`; v1 conflict rule is per-artifact-file last-write-wins with a surfaced warning. S3 implements the detection → `git-conflict` typed-error path; the warning UI is S5. [observed — DD-009 §Consequences:106,112]

## Prior art
- **The OPFS adapter is the defensive-shape blueprint** for the iso-git-fs shim (SSR guard, traversal rejection, typed `wrap()`), if the shim route is chosen. [observed — opfsAdapter.ts]
- **S2's mirror/ack pattern is the model for the worker request/response + status surface** — a thin transport (mirror enqueue / worker postMessage) over plain testable logic (the leaf `CorpusFS` / the git logic module), with a status/ack that surfaces failures rather than swallowing them. S3's worker is the transport; the git logic lives in a plain module the worker calls so CI tests it WITHOUT a worker (decomposition §Worker boundary). [observed — mirrorFs.ts]
- **S2's `fsaPicker` injectable-IDB / no-global-singleton discipline** is the model for keeping the worker-proxy testable (inject the transport; don't reach for a global `Worker`). [observed — fsaPicker.ts; corpus-fs-seam.md]
- **The Node spike's measurement harness** (`/tmp/iso-git-spike/spike.mjs`) is the literal template for the CI vitest test that runs real iso-git against a tmpdir: `fs.cpSync`/`init`/`add`/`commit`/`log`. [observed — isomorphic-git-perf-50mb.md:84-86]
- **The corpus-opfs-smoke.md / corpus-fsa-smoke.md docs** are the template for `corpus-git-smoke.md` (the out-of-CI real-worker + real-OPFS + real-remote gate). [observed — corpus-opfs-smoke.md]
- **iso-git pre-mortem narratives #2/#3/#5** (isomorphic-git-perf-50mb.md:69-74) are the DD-009-level pre-mortem for exactly S3's failures (the 3000-version log cliff, the OPFS-quota-in-a-worker swallow, the iso-git CVE supply-chain risk). S3 references these rather than re-running /pre-mortem. [observed]

## Gotchas

Failure-pattern grep: no matches found

- **iso-git needs a broader FS than `CorpusFS`.** iso-git's `fs` plugin requires a node-`fs`-like promise API: `readFile/writeFile/unlink/readdir/mkdir/rmdir/stat/lstat` (and `readlink`/`symlink` for some ops, though core commit/log/push/pull do not). `CorpusFS` is only 5 bytes+paths methods (`readFile/writeFile/readdir/rm/stat`) and has no `mkdir`/`lstat`/dir-stat. So S3 must EITHER (a) write a thin **iso-git-fs shim over `CorpusFS`** that synthesizes the missing surface (keeps the corpus single-substrate per DD-009's OPFS mandate, but must implement `mkdir` as a no-op/marker, `lstat`→`stat`, `unlink`→`rm`, `rmdir`, and `stat` returning the `{ mode, size, mtimeMs, isFile/isDirectory }` shape iso-git expects — `CorpusFS.stat` only returns `{size}`), OR (b) use **`@isomorphic-git/lightning-fs`** (what the browser spike used; IndexedDB-backed, NOT OPFS — a substrate split to reconcile later). **Tradeoff to resolve in the plan; document the choice.** [inferred — iso-git fs-plugin docs; types.ts CorpusFS surface; isomorphic-git-perf-50mb.md:63]
- **Turbopack, not webpack.** Next 16 `next build` defaults to Turbopack. The browser `buffer` polyfill the spike wired via "Webpack 5 fallback config" is NOT directly portable — under Turbopack the equivalent is `turbopack.resolveAlias` (map `buffer` to the polyfill) plus providing the `Buffer` global, OR avoiding the UMD build by importing iso-git's ESM entry and shimming `globalThis.Buffer` at the worker's top (a worker has its own global scope, so the polyfill lives in the worker, not the main bundle). **Resolve in plan; the worker-local Buffer shim is the cleaner option since iso-git only runs in the worker.** Get `npm run build` green either way. [inferred — Next 16 Turbopack default; iso-git-browser-smoke.md:75]
- **Adding a dependency** `isomorphic-git@^1.38.3` (+ `@isomorphic-git/lightning-fs@^4.6.2` if that route). This is the INITIATIVE'S FIRST dependency add — a supply-chain / maintenance surface (DD-009 §Revisit triggers: iso-git single-maintainer / CVE risk). Authorized by DD-009 (the whole spike series validated iso-git). Note in plan Risks. [observed — DD-009:116,123]
- **Worker untestable in jsdom; real remote untestable in CI.** Vitest runs on Node so REAL iso-git against a tmpdir IS testable (the git LOGIC), but a real `Worker`, real OPFS-backed git, and real network push/pull are NOT. Cover the logic in CI with real iso-git on `node:fs`+tmpdir; cover the worker/OPFS/remote in `docs/spikes/corpus-git-smoke.md`. **Do NOT claim the worker/remote flows are CI-tested.** [observed — corpus-fs-seam.md; iso-git-browser-smoke.md limitations]
- **`git.log({filepath})` eager-on-mount is the cliff.** Any history read MUST pass `depth` + a cursor (the `since`/`ref`-walk continuation). The CorpusGit `log` signature takes `{ filepath?, depth, cursor? }` and returns `{ entries, nextCursor }`. [observed — perf-characteristics.md:46]
- **iso-git `clone`/`push`/`pull` are HTTP-only and need an `http` client + `onAuth`.** `isomorphic-git/http/web` (browser) / `isomorphic-git/http/node` (CI). Auth failures (401/403) must reify to `{kind:"remote-auth-expired"}`, not a generic io error, so the S5 status UI can prompt re-auth. The CI test can exercise push/pull against a LOCAL bare repo over `http/node` against a tiny in-process server OR — simpler and honest for "iso-git's algorithmic cost" — test `commit`/`log`/`statusMatrix`/`packObjects` against a tmpdir and document the real-remote round-trip as a smoke item (the Node spike measured pack-build only, not a real remote). [observed — isomorphic-git-perf-50mb.md:38,80-81]
- **Conflict detection v1 = last-write-wins + warning.** On pull, a file changed on both sides is a conflict. iso-git's merge can report conflicts; v1 resolves per-file last-write-wins (take the incoming/our side per the rule) and SURFACES a `{kind:"git-conflict", path}` typed signal so S5 can warn. S3 implements the detection→typed-error path; it does NOT build conflict UI. [observed — DD-009:112]
- **Commit-on-write coupling is a design choice, not a forced wiring.** DD-009's write path is "commit to OPFS sync; async push with backoff." Whether S3 hooks git commits to every corpus `writeFile` (commit-on-write) vs. exposes a clean `CorpusGit.commit()` for a later sub-task (S4) to call on a logical save boundary is a decision. **Lean: expose a clean `CorpusGit` (commit/log/push/pull/status); wire commit-on-write only if it stays simple and flag-gated** (committing on every blob write would create noise commits; logical save boundaries belong to S4's session model). [inferred — DD-009 §Decision write path; decomposition S4 scope]
- **`.git/` lives at the corpus root** alongside `state/`/`workspaces/`/`settings.json`. iso-git's `dir` is the corpus root and `gitdir` defaults to `<dir>/.git`. The iso-git-fs shim (or lightning-fs) must expose the whole corpus root, not a sub-path. [inferred — iso-git API; paths.ts layout]

## Open design questions for the plan
- **Which FS does iso-git run on?** (a) iso-git-fs shim over `CorpusFS` (single-substrate, more code) vs (b) `@isomorphic-git/lightning-fs` (IndexedDB, substrate split). **Resolve + document the tradeoff.** Lean toward (a) for the testable git LOGIC layer (a shim over the in-memory `CorpusFS` fake lets CI run real iso-git on a real Node tmpdir via `node:fs` directly for perf-shaped tests AND over the shim for substrate-parity tests), keeping DD-009's OPFS single-substrate mandate; lightning-fs stays a documented fallback. [resolve in plan]
- **Worker protocol shape**: a typed request/response discriminated union (`{ type:"commit"|"log"|"push"|"pull"|"status", ... }` → `{ ok:true, result } | { ok:false, error: CorpusWorkerError }`), with the worker reifying every throw via `toWorkerError`. The main-thread proxy `createGitWorkerProxy(worker)` reconstructs `CorpusError` from `CorpusWorkerError`. Keep the worker THIN; the git logic is a plain module (`gitCore.ts`) the worker calls, so CI tests `gitCore` directly. [resolve in plan]
- **commit-on-write wiring**: expose `CorpusGit` cleanly (lean); wire commit-on-write only if simple + flag-gated. [resolve in plan]
- **CI remote test depth**: test commit/log/status/pack against a tmpdir (honest, matches the Node spike) and document real push/pull as a smoke item, vs. spin a local http bare-repo server in CI. **Lean: tmpdir for logic + smoke for real remote.** [resolve in plan]

## Files read
Last verified: 2026-06-01
Relevant paths: app/lib/corpus/, docs/decisions/009-artifact-corpus-architecture.md, docs/working/decomposition-corpus-architecture.md, docs/spikes/, docs/thoughts/
docs/decisions/009-artifact-corpus-architecture.md
docs/working/decomposition-corpus-architecture.md
docs/working/plan-corpus-s1.md
docs/working/checkpoint-corpus-s1.md
docs/working/plan-corpus-s2.md
docs/working/research-corpus-s2.md
docs/spikes/isomorphic-git-perf-50mb.md
docs/spikes/iso-git-browser-smoke.md
docs/spikes/corpus-opfs-smoke.md
docs/thoughts/isomorphic-git-perf-characteristics.md
docs/thoughts/corpus-fs-seam.md
app/lib/corpus/types.ts
app/lib/corpus/opfsAdapter.ts
app/lib/corpus/fsaAdapter.ts (S2, for the adapter-shape model)
app/lib/corpus/mirrorFs.ts (S2, for the ack/transport model)
app/lib/corpus/storeAdapter.ts
app/lib/corpus/flag.ts
app/lib/corpus/paths.ts
app/lib/corpus/manifest.ts
app/lib/corpus/__tests__/corpusFsContract.ts
app/lib/corpus/__tests__/inMemoryCorpusFs.ts
app/lib/corpus/__tests__/fakeFsaHandle.ts
app/lib/corpus/__tests__/storeAdapter-s2.test.ts
package.json, next.config.ts, vitest.config.ts
