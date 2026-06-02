# Checkpoint: corpus-s3 (DD-009 sub-task S3)
Date: 2026-06-01
Branch: feat/corpus-git-pipeline (off feat/corpus-architecture / S1)
Research: docs/working/research-corpus-s3.md
Plan: docs/working/plan-corpus-s3.md
Decomposition: docs/working/decomposition-corpus-architecture.md
Test strategy: docs/working/test-strategy-corpus-s3.md
Architecture review: docs/reviews/architecture-review-s3.md

## Project state
- **Branch purpose**: deliver DD-009's git half — a `CorpusGit` interface (commit/log/push/pull/status) backed by `isomorphic-git` in a dedicated worker, behind the default-off flag, without changing the localStorage path.
- **Position in larger initiative**: third of six sub-tasks (S0–S5); depends on S0 layout + S1; **parallel-independent of S2** (branched off S1, not S2). Provides cross-device sync + `(repo-url, sha, path)` citability (F8) + git provenance primitives (F6). commit-on-write wiring is deferred to S4.
- **Blocked on**: nothing (S1 contracts settled + committed; both iso-git spikes complete).

## Key findings (curated from research)
- **`git-conflict` and `remote-auth-expired` kinds, plus `toWorkerError`/`isCorpusWorkerError`/`CorpusWorkerError`, ALREADY EXIST in types.ts** — S3 is their first consumer; S3 adds NO new `CorpusErrorKind`. [observed — types.ts:41-96]
- **`CorpusGit` must be SEPARATE from `CorpusFS`** (S1 arch-review finding 2, ISP) — git operates *over* a `CorpusFS`, not as methods on it. [observed — types.ts:18-22]
- **iso-git needs a broader fs than `CorpusFS`** (readFile/writeFile/unlink/readdir/mkdir/rmdir/stat/lstat + `err.code` ENOENT branching + a `stat` with `isDirectory()`/`mode`/`size`). Verified against iso-git@1.38.3's `FileSystem` wrapper (index.js:4964, `normalizeStats` index.js:573). Chosen FS route: **(a) iso-git-fs shim over `CorpusFS`** (single-substrate per DD-009's OPFS mandate), NOT lightning-fs (IndexedDB, substrate split). [observed]
- **`git.log({filepath})` 3000-commit cliff** (~4.2s Node/~7s Chrome/~12s FF) → `log` MUST be lazy with `depth`+cursor. [observed — perf-characteristics.md:36-46]
- **Turbopack, not webpack** (Next 16 default; empty next.config.ts) — the Buffer polyfill goes worker-scope (cleaner) or via `turbopack.resolveAlias`. Node/CI has native Buffer. [observed]
- **Git LOGIC is CI-testable** (vitest runs on Node; real iso-git on a tmpdir, like the Node spike); the **worker + real OPFS + real remote are NOT** — out-of-CI smoke only. [observed]
- **iso-git@1.38.3 installed clean** — small well-known transitive set (~5.1MB); `npm audit` shows no new advisories from it (2 pre-existing moderate = postcss-via-next). [observed]

## Plan (summary — full steps in plan-corpus-s3.md)
1. `types.ts` edit — `CorpusGit` interface + log/status types; `gitProtocol.ts` request/response union. No new error kind.
2. `gitFs.ts` — iso-git-fs shim over `CorpusFS` (ENOENT throws, dir-stat synthesis).
3. (test-first) `gitFs.test.ts`.
4. `gitCore.ts` — real iso-git over injected `{fs,http,dir,onAuth}`; lazy-paginated `log`; conflict/auth typed errors.
5. (test-first) `gitCore.test.ts` (real tmpdir) + `gitCore-errors.test.ts` (injected 401 / divergence).
6. `gitProtocol.handleGitRequest` — reify every throw via `toWorkerError`.
7. (test-first) `gitProtocol.test.ts`.
8. `gitWorkerClient.ts` (proxy) + `gitWorker.ts` (thin worker entry + Buffer shim).
9. (test-first) `gitWorkerClient.test.ts` (fake transport; interface-separation assert).
10. Buffer polyfill + `npm run build` green (Turbopack); verify `gitWorker.ts` not reserved.
11. Out-of-CI `docs/spikes/corpus-git-smoke.md` (real worker+OPFS+remote).
12. Docs (CLAUDE.md + corpus-fs-seam.md S3 section).

Implementation order: `1 → [2,3] → [4,5] → [6,7] → [8,9] → 10 → 12`; 11 any time after 4.

## Invariants (filtered to S3's steps)
- No git methods on `CorpusFS`; `CorpusGit` is separate (arch-review F1).
- Reuse the single `CorpusErrorKind` source; no new kind; nothing untyped crosses `postMessage` (arch-review F4/F5).
- `log` is lazy-paginated (depth+cursor); never an eager unbounded log.
- Flag OFF byte-for-byte unchanged; S1 characterization + S1/S2-shared corpus tests still pass.
- Storage seam stays `CorpusFS`-typed (a future worker-proxy `CorpusFS` drops into `resolveCorpusFs`).
- SSR safety: no `Worker`/OPFS/network at import or render.
- No module under `app/` named with a reserved App Router filename; worker is `gitWorker.ts`.
- iso-git contained to worker-side files (gitCore/gitWorker) behind the flag (arch-review F6).

## File map
- `app/lib/corpus/types.ts` — add `CorpusGit` + log/status types (step 1, edit)
- `app/lib/corpus/gitProtocol.ts` — worker request/response union + `handleGitRequest` (steps 1,6, new)
- `app/lib/corpus/gitFs.ts` — iso-git-fs shim over CorpusFS (step 2, new)
- `app/lib/corpus/gitCore.ts` — real iso-git logic over injected deps (step 4, new)
- `app/lib/corpus/gitWorkerClient.ts` — main-thread CorpusGit proxy (step 8, new)
- `app/lib/corpus/gitWorker.ts` — thin Web Worker entry + Buffer shim (step 8, new)
- `app/lib/corpus/__tests__/gitFs.test.ts` (step 3, new test)
- `app/lib/corpus/__tests__/gitCore.test.ts` (step 5, new test — real tmpdir)
- `app/lib/corpus/__tests__/gitCore-errors.test.ts` (step 5, new test)
- `app/lib/corpus/__tests__/gitProtocol.test.ts` (step 7, new test)
- `app/lib/corpus/__tests__/gitWorkerClient.test.ts` (step 9, new test)
- `next.config.ts` — Buffer/turbopack wiring if needed (step 10, edit)
- `package.json` / lockfile — add `isomorphic-git@^1.38.3` (+ `buffer` if needed) (edit)
- `docs/spikes/corpus-git-smoke.md` — out-of-CI real worker+remote gate (step 11, new)
- `meta-formalism-copilot/CLAUDE.md` — document S3 git modules + dependency (step 12, edit)
- `docs/thoughts/corpus-fs-seam.md` — S3 seam section (step 12, edit)

(16 entries — within the 20-entry checkpoint budget; no decomposition warning triggered.)

## Open questions
- **Turbopack Buffer**: worker-scope shim expected sufficient; confirm `npm run build` green (resolve at step 10).
- **CI conflict test**: produce a real both-sides divergence via two tmpdir clones vs a stubbed merge — prefer the real divergence for honesty (resolve at step 5).
- **gitFs dir-stat heuristic** (stat-null + readdir-nonempty) — confirm against real iso-git over the shim (G7–G13); lightning-fs fallback if fragile.
