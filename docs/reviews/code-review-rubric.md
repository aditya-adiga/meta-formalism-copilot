# Code Review Rubric

**Scope:** feat/corpus-architecture vs main (`app/` code only; ~1166 lines, 15 files) | **Reviewed:** 2026-06-01 | **Commit:** 2dc403e | **Status: 🟡 CONDITIONAL PASS** — 4 amber item(s), all fixed in follow-up commit

Pipeline: code-fact-check + security + performance + api-consistency + architecture-review (code-stage) + tech-debt-triage (advisory). test-strategy skipped (tests ship with the change); dependency-upgrade skipped (no manifest change).

---

## 🔴 Must Fix

None.

---

## 🟡 Must Address

| # | Finding | Domain | Source | Legibility-target | Considered overrides | Status | Author note |
|---|---|---|---|---|---|---|---|
| A1 | `WorkspaceManifest.customTypeIds` should be `customArtifactTypeIds` to match the app-wide `customArtifactType*` vocabulary; cheap now (no consumers), on the S4 reconciliation path | API Consistency (Inconsistent) | api-consistency | for-author | — | ✅ Fixed | Renamed in manifest.ts + test |
| A2 | `createCorpusBackedStorage` writes the blob under `state/<name>.json`, a namespace parallel to the `paths.ts` folder layout that bypasses the traversal choke point and that S4 migration must reconcile | Architecture (Coupling, escalated) | api-consistency + architecture (converged) | for-author | — | ✅ Fixed | Added STATE_DIR/stateBlobPath in paths.ts + breadcrumb |
| A3 | Stale comments: `layout.ts` ref in storeAdapter.ts (file is `paths.ts`) and `workspaceStore.ts:44-46` ref in opfsAdapter.ts (swallow code now in storeAdapter.ts) | Fact-check (Mostly Accurate) | fact-check + tech-debt | for-author | — | ✅ Fixed | Comments corrected |
| A4 | manifest.ts docstring drift: implies a `browser-storage-cleared` throw the codec never emits (only `io`); claims "never silent default" but defaults `createdAt`/`updatedAt` | Fact-check / Architecture (Minor, converged) | fact-check + architecture (F3) | for-author | — | ✅ Fixed | Docstring corrected to match behavior |

---

## 🟢 Consider

| # | Finding | Source | Legibility-target | Considered overrides |
|---|---|---|---|---|
| C1 | opfsAdapter `splitPath` doesn't reject `.`/`..`/backslash — defense-in-depth, latent once S4 has many callers | security (Low) | for-author | — |
| C2 | flag.ts has no `NODE_ENV` guard; enabling it swaps to an empty corpus and existing localStorage work appears to vanish (data-availability footgun) | security (Low) | for-author | — |
| C3 | `walkDir` re-resolves the full directory chain per op; add handle caching/batching before S4's files-per-artifact layout makes it O(files×depth) round-trips | performance (Low→Med for S4) | for-author | — |
| C4 | Corpus storage seam is async + un-debounced and zustand doesn't await it → a quota/io failure under the flag is a silently-dropped floating promise (the silent-fallback DD-009 forbids). Needs debounce + sync-ack in S2/S3/S5 | tech-debt #2 (+ performance) | for-author | — |
| C5 | `readdir` casing vs codebase camelCase | api-consistency (Minor) | for-author | — |
| C6 | Playwright OPFS smoke documented but not yet run/automated — run once before the flag is enabled anywhere shared | tech-debt #4 | for-author | — |
| C7 | Error messages embed corpus paths; manifest doesn't re-sanitize id/ext — forward note for S3/S4 | security (Info) | for-author | — |
| C8 | paths.ts/manifest.ts built but unused until S4 (dead-until-later) — intentional staging, tracked in decomposition | tech-debt #1 | for-orchestrator-synthesis | — |
| C9 | Dev flag + no migration = data loss on toggle — intentional, documented | tech-debt #5 | for-orchestrator-synthesis | — |

---

## ↩️ Considered Overrides

No prior overrides matched this diff. (override-log.md created this run; no rows yet.)

---

## ✅ Confirmed Good

| Item | Verdict | Source | Legibility-target |
|---|---|---|---|
| Path sanitization is allowlist (`[^a-zA-Z0-9_-]+`) + NFKD + empty-result throw; `../etc/passwd`→`etc-passwd`, `..`→throws | ✅ Confirmed | security | for-orchestrator-synthesis |
| OPFS quota reified to `{kind:"quota-exceeded",substrate:"opfs"}` not swallowed; SSR guard rejects typed before touching navigator.storage | ✅ Confirmed | security + fact-check | for-orchestrator-synthesis |
| CorpusFS has exactly 5 methods, no git; CorpusGit reserved for S3 | ✅ Confirmed | fact-check + api-consistency + architecture | for-orchestrator-synthesis |
| Single substrate-neutral CorpusErrorKind feeds both CorpusError and CorpusWorkerError | ✅ Confirmed | api-consistency + architecture | for-orchestrator-synthesis |
| Store binds to the CorpusFS abstraction; OPFS isolated to one composition root — S2/S3/S4 are drop-in swaps | ✅ Confirmed | architecture | for-orchestrator-synthesis |
| Debounced-localStorage OFF path moved verbatim (behavior parity) | ✅ Confirmed | performance + fact-check | for-orchestrator-synthesis |

---

## ⏭️ Skipped Core Critics

All core critics ran; no skips applied. (test-strategy and dependency-upgrade are contextual and were not triggered.)

---

To pass review: all 🔴 resolved (none). All 🟡 fixed or carrying an author note (all 4 fixed). 🟢 optional.
