# Checkpoint: corpus-s2 (DD-009 sub-task S2)
Date: 2026-06-01
Branch: feat/corpus-fsa-mirror (off feat/corpus-architecture / S1)
Research: docs/working/research-corpus-s2.md
Plan: docs/working/plan-corpus-s2.md
Decomposition: docs/working/decomposition-corpus-architecture.md
Test strategy: docs/working/test-strategy-corpus-s2.md
Architecture review: docs/reviews/architecture-review-s2.md

## Project state
- **Branch purpose**: deliver DD-009's opt-in user-visible FSA folder mirror — an FSA-backed `CorpusFS`, an async OPFS→FSA mirror with retry + truthful sync-ack, read-path fallthrough, and a folder-pick/permission flow — behind the existing default-off flag, without changing the localStorage default or S1's committed behavior.
- **Position in larger initiative**: second of six sub-tasks (S0–S5); depends on S1 (OPFS adapter + `CorpusFS` seam), parallel-independent of S3 (git pipeline). Contributes S2's failure variants toward S5's status UI (which it does NOT build).
- **Blocked on**: nothing — S1 contracts are settled and committed; /away mode, implementing test-first.

## Key findings (curated from research)
- **The FSA adapter is the OPFS adapter with two deltas**: root is a passed-in `FileSystemDirectoryHandle` (from the picker), not `navigator.storage.getDirectory()`; FSA can throw `NotAllowedError`/`SecurityError` on permission loss → `{kind:"fsa-permission-revoked"}` (already in the union). Same SSR guard, `splitPath` traversal rejection, per-op `walkDir`, `wrap()` error mapping. [observed — opfsAdapter.ts]
- **The mirror is a decorator over two `CorpusFS` instances**, not a property of any leaf adapter: write primary-sync + mirror-async-with-retry; read primary-then-fallthrough; expose `getMirrorStatus()`/`onMirror` ack. It is the natural home for S1 review **C4**'s surfacing half (no silent fallback). [observed — decomposition §sync-ack; code-review-rubric C4]
- **jsdom has NO FSA** (no `showDirectoryPicker`, no `FileSystemDirectoryHandle`) — same as OPFS. Test via the shared `defineCorpusFsContract` over a fake handle + two in-memory fakes for the mirror; stub `window.showDirectoryPicker` for the picker. Real browser FSA flow = out-of-CI smoke, NOT claimed CI-tested. [observed]
- **DD-009 pre-mortem narrative #4 IS S2's central risk** ("FSA permission silently revoked → 'saved' lies"); its mitigation (ack tied to FSA-mirror enqueue, not OPFS commit) is exactly S2's `getMirrorStatus()`/ack design. Reference it; do not re-run /pre-mortem. [observed — isomorphic-git-perf-50mb.md:73]
- **No new dependency, no new error kind**: FSA + IDB are browser APIs; `fsa-permission-revoked`/`browser-storage-cleared`/substrate-tagged `quota-exceeded` already exist in the single `CorpusErrorKind` source. [observed — types.ts:41-49]
- **C3 (walkDir per-op re-resolution)** carried forward unfixed by design — cross-adapter perf refactor for S3/S4 (S2 is blob-mode; mirror copies whole files). [observed — code-review-rubric C3]

## Plan (summary — full steps in plan-corpus-s2.md)
1. `corpus/fsaAdapter.ts` — `createFsaCorpusFs(handle)`: OPFS-shaped adapter; perm/quota/unavailable/traversal → typed errors.
2. **(test-first)** `__tests__/fakeFsaHandle.ts` + `fsaAdapter.contract.test.ts` (shared contract over fake handle) + `fsaAdapter.test.ts` (error mapping).
3. `corpus/mirrorFs.ts` — `createMirrorCorpusFs({primary, mirror?})`: write-sync+mirror-async-retry, read fallthrough, `getMirrorStatus()`/`onMirror`.
4. **(test-first)** `mirrorFs.test.ts` + `mirrorFs.contract.test.ts` (two in-memory fakes).
5. `corpus/fsaPicker.ts` — `pickFolder`/`ensurePermission`/`saveHandle`/`loadHandle` (IDB injected; no global singleton).
6. **(test-first)** `fsaPicker.test.ts`.
7. `corpus/storeAdapter.ts` — factor `resolveCorpusFs(connected?)`; third branch flag-ON+folder → mirror; OFF/OPFS arms unchanged.
8. `storeAdapter-s2.test.ts` — third branch + S1 parity.
9. `docs/spikes/corpus-fsa-smoke.md` — out-of-CI real-browser smoke.
10. Docs (CLAUDE.md + corpus-fs-seam.md).

Implementation order: `[1,2] → [3,4] → [5,6] → 7 → 8 → 10`; 9 any time after 1.

## Invariants (filtered to S2's steps)
- S1 OFF path byte-for-byte; S1 characterization + flag-routing tests still pass. S2 adds only a third arm inside the flag-ON path.
- No `window`/`showDirectoryPicker`/`FileSystemDirectoryHandle`/IDB access during render or at module import; picker only from a user gesture.
- No silent fallback: mirror failure → typed error + status `failed` + ack. Read fallthrough is the only allowed fallthrough (recovery, surfaces nothing misleading).
- New failure kinds only in `types.ts`; `fsa-permission-revoked` already exists — reuse it. Mirror status is a separate mirror-local type, not a union extension.
- Git stays out of `CorpusFS`; mirror composes FS only.
- Production guard in flag.ts untouched. Connected handle is injected into selection, not a picker singleton (arch-review F3).
- No module under `app/` named layout/page/route/template/default/loading/error/not-found.

## File map
- `app/lib/corpus/fsaAdapter.ts` — FSA-backed CorpusFS (step 1, new)
- `app/lib/corpus/mirrorFs.ts` — OPFS+FSA composite + ack (step 3, new)
- `app/lib/corpus/fsaPicker.ts` — folder pick + permission + IDB persistence (step 5, new)
- `app/lib/corpus/storeAdapter.ts` — third branch + `resolveCorpusFs` helper (step 7, edit)
- `app/lib/corpus/__tests__/fakeFsaHandle.ts` — fake FileSystemDirectoryHandle (step 2, new test helper)
- `app/lib/corpus/__tests__/fsaAdapter.contract.test.ts` — shared contract over fake handle (step 2, new test)
- `app/lib/corpus/__tests__/fsaAdapter.test.ts` — error mapping (step 2, new test)
- `app/lib/corpus/__tests__/mirrorFs.test.ts` — mirror behavior (step 4, new test)
- `app/lib/corpus/__tests__/mirrorFs.contract.test.ts` — mirror passes contract (step 4, new test)
- `app/lib/corpus/__tests__/fsaPicker.test.ts` — picker/permission/persistence (step 6, new test)
- `app/lib/corpus/__tests__/storeAdapter-s2.test.ts` — third branch + S1 parity (step 8, new test)
- `docs/spikes/corpus-fsa-smoke.md` — out-of-CI FSA smoke (step 9, new)
- `meta-formalism-copilot/CLAUDE.md` — document new modules + mirror branch (step 10, edit)
- `docs/thoughts/corpus-fs-seam.md` — mirror/ack contract + FSA caveat (step 10, edit)

(14 entries — within the 20-entry checkpoint budget; no decomposition warning triggered.)

## Open questions
- **Read fallthrough granularity**: resolved to per-path (`readFile`/`stat`/`readdir` fall through on primary-miss) — confirm acceptable.
- **Retry policy**: resolved to bounded backoff (3 attempts, 100/300/900ms) then `failed` — confirm bound is reasonable for a dev-only flag.
- **Handle persistence**: resolved to IDB-persist + explicit re-grant on load; documented fallback is re-pick-per-session — confirm IDB is worth it vs re-pick for S2.
- **C4 other half (store await/debounce + S5 UI)**: explicitly OUT of S2 — S2 makes the ack exist + truthful; confirm that's the right S2/S5 boundary.
