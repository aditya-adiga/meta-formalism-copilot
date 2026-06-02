# Plan: DD-009 corpus S2 — FSA folder mirror + folder-pick UX (behind the flag)

- **Goal**: Implement DD-009's opt-in, user-visible FSA folder as the source-of-truth mirror — an FSA-backed `CorpusFS`, an async OPFS→FSA mirror-on-write with retry + a truthful sync-ack, read-path fallthrough (OPFS empty → read FSA), and a folder-pick + permission flow — all behind the existing default-off corpus flag, without disturbing the localStorage default or S1's committed behavior.
- **Project state**: branch `feat/corpus-fsa-mirror` off `feat/corpus-architecture` (S1, not yet merged to main); second of the S0–S5 sub-tasks; depends on S1, parallel-independent of S3 · not blocked (S1 contracts settled + committed).
- **Task status**: in-progress (research + test-strategy + arch-review gates complete; implementing test-first behind the flag).

Research: docs/working/research-corpus-s2.md
Decomposition: docs/working/decomposition-corpus-architecture.md
Test strategy: docs/working/test-strategy-corpus-s2.md
Architecture review: docs/reviews/architecture-review-s2.md

## Approach

Build the FSA half of DD-009's #4' write/read path as additive composition over S1's `CorpusFS` seam, entirely behind the existing default-off, dev-only flag. Three new self-contained modules in `app/lib/corpus/`: an **FSA-backed `CorpusFS`** (`fsaAdapter.ts`) structurally identical to the OPFS adapter but over a passed-in `FileSystemDirectoryHandle`, a **composite `CorpusFS`** (`mirrorFs.ts`) that writes to the OPFS primary synchronously and enqueues an async mirror-to-FSA with retry/backoff while exposing a truthful `getMirrorStatus()`/ack surface, and a **folder-pick module** (`fsaPicker.ts`) wrapping `showDirectoryPicker()` + permission query/request + IndexedDB handle persistence. The storeAdapter gains one new branch (flag ON + folder connected → mirror) leaving the OFF and OPFS-only paths byte-for-byte. Tests come first and run against fake handles + two in-memory fakes (jsdom has no FSA), held to S1's shared `CorpusFS` contract; the real browser FSA flow is documented as an out-of-CI manual/Playwright smoke, never claimed as CI-tested.

**Contract decisions resolved here** (from research + test-strategy gap enumeration):
- **Read fallthrough is per-path**: a `readFile`/`stat`/`readdir` that the OPFS primary cannot satisfy falls through to the FSA mirror (browser-storage-clear recovery). This is the ONE allowed fallthrough; it suppresses nothing misleading. (research Open question; arch-review F4)
- **No silent fallback on write**: a mirror failure surfaces via `getMirrorStatus()`→`failed` carrying the typed `CorpusError` AND notifies an ack listener; it does NOT swallow (DD-009 §Failure-driven; this is S1 review C4's surfacing half). The store-side `await`/debounce and the status *UI* are S5.
- **Retry policy**: bounded exponential backoff (3 attempts, 100/300/900ms), then status `failed`; no infinite retry (background-throttle/battery).
- **Handle persistence**: persist the `FileSystemDirectoryHandle` in IndexedDB, but require an explicit reconnect + permission re-grant on load (browsers require a user gesture to re-`requestPermission`; no silent auto-grant is possible or attempted). If IDB proves fiddly, the documented fallback is re-pick-per-session — acceptable for a dev-only flag.
- **No new error kind**: FSA failures map onto the existing single `CorpusErrorKind` source (`fsa-permission-revoked`, `{quota-exceeded, substrate:"fsa"}`); the mirror's `pending|ok|failed` status is a separate mirror-local type, not a union extension (arch-review F5).
- **C3 deferred**: the FSA adapter inherits OPFS's per-op `walkDir` re-resolution; handle caching is a cross-adapter refactor for S3/S4 when files-per-artifact actually lands (S2 is blob-mode; the mirror copies whole files). Documented, not dropped.

## Steps

1. **FSA adapter — `fsaAdapter.ts`.** New `createFsaCorpusFs(handle: FileSystemDirectoryHandle): CorpusFS` over a passed-in directory handle. Mirror the OPFS adapter structure: local minimal FSA handle typings; `splitPath` traversal rejection (parity with OPFS C1); per-op `walkDir`; `wrap()` mapping `NotAllowedError`/`SecurityError`→`{kind:"fsa-permission-revoked"}`, `QuotaExceededError`→`{kind:"quota-exceeded", substrate:"fsa"}`, `NotFoundError`→null-or-`[]`, else `{kind:"io"}`. SSR/unavailable guard: a missing/invalid handle (or `typeof window === "undefined"`) rejects `{kind:"unavailable"}`. (~190 lines, new file) — Closes G1–G10.
2. **Test-first — FSA adapter contract + error tests.** New `__tests__/fakeFsaHandle.ts` (recursive Map-backed fake `FileSystemDirectoryHandle` with per-op throw injection), `__tests__/fsaAdapter.contract.test.ts` (run `defineCorpusFsContract` over the fake handle), `__tests__/fsaAdapter.test.ts` (unavailable/permission/quota/traversal error mapping). Commit `test:` alongside step 1's `feat:` (or just before). (~220 lines across files) — Closes G1–G10.
3. **Mirror composite — `mirrorFs.ts`.** New `createMirrorCorpusFs({ primary, mirror? })`: `writeFile` writes primary sync, resolves on primary success, enqueues async mirror write with bounded backoff; `rm` same shape; `readFile`/`stat` return primary value, fall through to mirror on `null`; `readdir` returns sorted union with mirror fallthrough; `getMirrorStatus()` returns `{state:"idle"|"pending"|"ok"|"failed", lastError?}`; `onMirror(cb)` subscription fires on each enqueue resolution/failure. No mirror configured → behaves as bare primary. (~200 lines, new file) — Closes G11–G19.
4. **Test-first — mirror behavior + contract.** New `__tests__/mirrorFs.test.ts` (write-sync/mirror-async, retry-then-succeed, exhaustion→failed+ack, permission-revoked→failed, read fallthrough, no-mirror passthrough, readdir fallthrough, rm propagation — driven with `vi.useFakeTimers()` + `advanceTimersByTimeAsync`) and `__tests__/mirrorFs.contract.test.ts` (`defineCorpusFsContract` over two in-memory fakes). Commit `test:`. (~240 lines) — Closes G11–G20.
5. **Folder pick + permission + persistence — `fsaPicker.ts`.** New `pickFolder()` (user-gesture `showDirectoryPicker`; `AbortError`→`null`; absent API→`{kind:"unavailable"}`), `ensurePermission(handle, mode)` (`queryPermission` `"granted"`→true, `"prompt"`→`requestPermission`, `"denied"`→`{kind:"fsa-permission-revoked"}`), `saveHandle`/`loadHandle` (IndexedDB get/set injected as functions so tests pass an in-memory map; no `window`/IDB access at import time). Pure function module — returns handles/status, holds no global singleton (arch-review F3). (~150 lines, new file) — Closes G21–G24.
6. **Test-first — picker tests.** New `__tests__/fsaPicker.test.ts`: stubbed `window.showDirectoryPicker`, fake handle with `queryPermission`/`requestPermission`, injected in-memory IDB map. (~120 lines) — Closes G21–G24.
7. **Wire the third branch — `storeAdapter.ts`.** Factor a small `resolveCorpusFs(connected?: CorpusFS): CorpusFS` (arch-review F2): flag ON + a connected FSA `CorpusFS` → `createMirrorCorpusFs({primary: createOpfsCorpusFs(), mirror: connected})`; flag ON + none → bare OPFS (S1 behavior); flag OFF → localStorage (unchanged). The connected FSA `CorpusFS` is passed in / injected, not reached out of the picker (arch-review F3). Keep the `StateStorage` wrapping untouched. (~40 lines edit + small helper) — Closes G25.
8. **Test — storeAdapter third branch.** New `__tests__/storeAdapter-s2.test.ts`: flag OFF → localStorage, no FSA/OPFS touched; flag ON/no-folder → OPFS; flag ON + injected connected fake → mirror composite receives the write (spy). Confirms S1 parity for the first two arms. (~120 lines) — Closes G25.
9. **FSA browser smoke (out-of-CI, pre-merge).** New `docs/spikes/corpus-fsa-smoke.md` mirroring `corpus-opfs-smoke.md`: run the shared contract behaviors against `createFsaCorpusFs(realHandle)` + the picker + permission re-grant across reload, in real Chromium/Edge (Firefox/Safari lack `showDirectoryPicker`). Not in CI. (~60 lines doc, no script committed) — documents the real-env half of G1–G10, G21–G24.
10. **Docs.** Update `meta-formalism-copilot/CLAUDE.md` (`app/lib/corpus/` entry: add fsaAdapter/mirrorFs/fsaPicker + the connected-folder mirror branch) and `docs/thoughts/corpus-fs-seam.md` (the mirror/ack contract + FSA-no-jsdom caveat for S3–S5). (small)

## Implementation order

`[1,2] → [3,4] → [5,6] → 7 → 8 → 10`, with **9 writable any time after 1** and **10 last**.

Reading: the FSA adapter (1) and its tests (2) are foundational and independent. The mirror (3,4) depends on the `CorpusFS` interface only (composes any two — uses in-memory fakes in tests), so it can be built right after the adapter or in parallel. The picker (5,6) is independent of both. The storeAdapter wiring (7) depends on the mirror + a way to obtain a connected FSA `CorpusFS` (adapter + picker), and its test (8) depends on 7. The smoke doc (9) needs only the adapter; docs (10) describe the finished seam.

## Size estimate

All new files are well under 500 lines (largest: mirrorFs ~200, fsaAdapter ~190; tests split across files). The only edit to an existing file is step 7's storeAdapter branch (currently 79 lines → ~120 with the `resolveCorpusFs` helper) — stays well under the limit. Net new: ~1300 lines, ~65% tests.

## Estimated context cost

Research ~30k (complete), Implementation ~55k, Review/verify ~20k.

## Actual context cost (post-implementation)

Research ~28k, Implementation ~48k, Review/verify ~14k. Roughly on estimate; implementation a touch under (S2 mirrors S1's shapes closely, so the adapter/test scaffolding was largely pattern-following).

## Test specification

Folded from the test-strategy auto-invoke (full artifact: docs/working/test-strategy-corpus-s2.md; gap list G1–G25 there). The skill ran and returned 25 gaps; below maps each recommended test to gaps and a diagnostic expectation.

| Test case | Expected behavior | Level | Diagnostic expectation | Closes gaps |
|---|---|---|---|---|
| FSA adapter via shared `defineCorpusFsContract` over a fake handle | identical behavior to OPFS + in-memory (null-on-missing, 256-byte round-trip, nested create+readdir, rm idempotent, 30-files, overwrite) | contract | print path + expected vs actual bytes on mismatch | G1,G2,G3,G4,G5,G6 |
| FSA adapter error mapping: no handle / `NotAllowedError`+`SecurityError` / `QuotaExceededError` / `..` segment | rejects `{kind:"unavailable"}` / `"fsa-permission-revoked"` / `{quota-exceeded,substrate:"fsa"}` / `"io"` | unit | assert on `detail.kind`; print full typed error | G7,G8,G9,G10 |
| Mirror write/retry/ack: primary-sync + mirror-async; retry-then-ok; exhaustion→failed+ack; permission-revoked→failed; read fallthrough; no-mirror passthrough; readdir fallthrough; rm propagation | primary unaffected by mirror failure; status truthful; nothing swallowed | unit | print mirror status transitions + which fs got the write | G11–G19 |
| Mirror passes shared `CorpusFS` contract (two in-memory fakes) | a mirror IS a valid CorpusFS; readdir sorted | contract | print contract case + diff | G20 |
| Picker: absent API / `AbortError` / permission query→request→denied / IDB save+load round-trip | `{unavailable}` / `null` (cancel) / `fsa-permission-revoked` on denied / handle round-trips, empty→null | unit | print which permission branch ran; print stored vs loaded | G21,G22,G23,G24 |
| storeAdapter third branch: OFF→localStorage; ON/no-folder→OPFS; ON+connected→mirror | first two arms = S1 parity; third routes through mirror | integration | spy: print which fs received the write + call counts | G25 |
| FSA browser smoke (out-of-CI) | real Chromium/Edge: contract behaviors + picker + permission re-grant across reload | e2e (manual) | script/checklist prints per-op result | G1–G10,G21–G24 (real-env) |

## Failure modes considered

**Gate decisions (both Round-1 triggers evaluated independently):**
- **`/pre-mortem`: not triggered at the S2 level; the DD-009-level pre-mortem already covers S2's headline failure.** S2 is flag-gated (default-off, dev-only), fully reversible (three new modules + one small wiring branch), no single concern >500 LOC (~65% tests), and crosses no *new* trust boundary beyond the user-chosen FSA folder DD-009 already analyzed. The DD-009 `/pre-mortem` (docs/spikes/isomorphic-git-perf-50mb.md §Failure narratives) produced narrative **#4 — "FSA permission silently revoked across browser restart → 'saved' indicator lies"**, which is *exactly* S2's central risk; its mitigation (ack tied to FSA-mirror enqueue, not OPFS commit; surface "saved locally — corpus folder not connected") is the `getMirrorStatus()`/ack design in this plan. S2 references that pre-mortem rather than re-running it. S2-specific failures are the table below.
- **`/architecture-review`: triggered** — the plan adds ≥2 new modules under `app/lib/corpus/`, new public exports, and changes the storeAdapter composition root (a cross-cutting DI seam) and introduces a retry/error-handling pipeline (the mirror) — two of the four trigger categories. Run on this plan; output at `docs/reviews/architecture-review-s2.md`. **Findings folded in: F3 (connected handle is injected, not a picker singleton) → step 7; F4 (LSP-faithful fallthrough: sorted readdir, `null` stays `null`) → steps 3/4 + the mirror contract test; F5 (no new error kind; mirror status is a separate type) → step 1/3; F1/F2 (keep `mirrorFs` minimal, factor `resolveCorpusFs`) → steps 3/7. No Structural findings; two Coupling findings (F3,F4) both addressed by S1's DI+contract discipline.**

| Failure mode | Guard |
|---|---|
| Mirror failure silently swallowed (the silent fallback DD-009 forbids; repeats the legacy `console.warn` swallow) | Structural: mirror raises typed `CorpusError` + sets `getMirrorStatus()`→`failed` + fires `onMirror` ack (test G14/G19); the primary write still succeeds so the user is never blocked, but the failure is *surfaced*, not hidden |
| "Saved" looks true when bytes never reached the folder (pre-mortem #4) | The ack derives from the FSA-mirror enqueue/flush result, never the OPFS write-ack (test G12/G14); S2 ships no green "saved" UI (that truthful indicator is S5, fed by this ack) |
| FSA permission lost across reload mapped to a generic error → UI can't prompt re-grant | Maps `NotAllowedError`/`SecurityError`→`{kind:"fsa-permission-revoked"}` (test G8); picker `ensurePermission` distinguishes granted/prompt/denied (test G23) |
| User-cancel of the folder picker treated as a failure | `AbortError`→resolve `null` (folder stays disconnected), not a thrown error (test G22) |
| FSA adapter "passes" in CI only because jsdom lacks FSA, masking real breakage | Structural: contract suite runs against a fake handle in CI AND a real-browser smoke (step 9) gates pre-merge; the unavailable-guard test (G7) asserts the no-FSA path rejects loudly |
| Path traversal via a crafted path escapes the FSA folder | `splitPath` rejects `..`/backslash segments (test G10), parity with OPFS C1; paths still come only from `paths.ts` |
| Mirror retries forever in a backgrounded throttled tab (battery/CPU) | Bounded backoff (3 attempts) then `failed`; no infinite loop (test G13/G14) |
| Enabling the flag + connecting a folder corrupts the localStorage OFF path | storeAdapter third branch is inside the flag-ON path only; OFF arm untouched (test G25 asserts S1 parity); flag stays default-off + production-guarded |

## Risks

- **The fake `FileSystemDirectoryHandle` may diverge from real FSA semantics** (permission timing, `values()` vs `keys()`/`entries()` iteration, `createWritable` truncation behavior). Same residual risk class as S1's in-memory-fake-vs-OPFS; mitigated not eliminated by the out-of-CI FSA smoke (step 9) and by keeping the fake faithful to the OPFS test's shape.
- **Firefox/Safari lack `showDirectoryPicker`** — on those browsers the picker rejects `{kind:"unavailable"}` and the app stays OPFS-only (DD-009 degraded mode). The smoke covers Chromium/Edge only; FSA-on-Firefox/Safari is a non-goal (the API isn't there), consistent with DD-009's #4'-over-#4 rationale.
- **Handle persistence across reload is the fragile part** — IDB structured-clone of a handle works only in real browsers and the permission grant may not survive. The unit test mocks IDB; the real round-trip + re-grant is a smoke item. Fallback (re-pick per session) is documented and acceptable for a dev-only flag.
- **C4's other half is out of S2** — S2 makes the mirror ack exist and be truthful, but wiring zustand to actually `await`/debounce the seam and a UI to consume the ack is S5. Until then, under the flag, a failed mirror is *surfaced via status/ack* but there is still no UI showing it. Acceptable: the flag is dev-only and the signal now exists for S5 to consume. Flagged so it is not mistaken for "C4 fully closed."
- **C3 (walkDir per-op re-resolution)** carried forward unfixed by design — a cross-adapter perf refactor for S3/S4, not an S2 blob-mode concern.

## Rollback

This slice ships no user-visible change (flag default-off, production-guarded), so post-ship rollback is low-stakes:

1. `git revert <s2-merge-sha>` — removes the three new modules + the step-7 storeAdapter branch atomically. Because the flag is default-off and the third branch is reachable only with the flag ON + a folder connected, no production data path used the mirror; revert has no data-state consequence.
2. If only the wiring is suspect (adapter/mirror/picker are harmless dead code), revert just the step-7 commit to restore S1's two-arm `resolveWorkspaceStorage`, leaving the new modules in place.
3. No schema/data migration to undo (S2 introduces none beyond the optional IDB-persisted handle). To clear a dev-persisted handle: delete the IndexedDB store in the browser's site-data, or clear via the dev console.
4. **No irreversible component.** The only persistent side effects possible are (a) OPFS files written during *dev* testing with the flag on (clear as in S1's rollback) and (b) files written into the *user-chosen* FSA folder during dev testing — these are in a folder the dev explicitly picked and can delete in their normal file manager.
