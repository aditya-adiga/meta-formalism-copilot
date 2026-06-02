# Test Strategy: DD-009 corpus S2 (FSA folder mirror + folder-pick UX)

**Scope:** planned new files `app/lib/corpus/fsaAdapter.ts` (FSA-backed `CorpusFS`), `app/lib/corpus/mirrorFs.ts` (OPFS+FSA composite with retry + sync-ack), `app/lib/corpus/fsaPicker.ts` (folder pick + permission + handle persistence) + a third branch in `app/lib/corpus/storeAdapter.ts` (folder connected → mirror composite). All behind the existing default-off flag.
**Reviewed:** 2026-06-01

## Test Conventions

Vitest 4 + jsdom + Testing Library. Corpus tests live in `app/lib/corpus/__tests__/*.test.ts`; the shared `CorpusFS` contract is `defineCorpusFsContract(label, makeFs)` in `corpusFsContract.ts` and is run from a `*.contract.test.ts` file. The in-memory fake is `createInMemoryCorpusFs()`. The OPFS adapter's error paths are tested by stubbing `navigator.storage` with a fake recursive directory handle (opfsAdapter.test.ts) — S2 copies this fake-handle technique for FSA. `beforeEach` clears state; debounced writes flush via `vi.useFakeTimers()` + `vi.advanceTimersByTime`; async retry/backoff is driven with `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(...)`.

**Critical infra fact:** jsdom implements neither OPFS nor FSA. `window.showDirectoryPicker` and `FileSystemDirectoryHandle` are absent. The FSA adapter's real I/O and the real picker flow cannot run under Vitest — they are tested via (a) the shared contract suite against a **fake `FileSystemDirectoryHandle`** for logic equivalence, (b) stubbed `window.showDirectoryPicker` for the picker, and (c) an out-of-CI manual/Playwright smoke (`docs/spikes/corpus-fsa-smoke.md`) for the real browser flow. Tests that "pass" by silently skipping absent FSA would be worse than none.

## Untested Paths Touched by the Change

All paths are in not-yet-written files; line numbers are indicative of the planned structure.

- **G1** — `fsaAdapter.ts` `readFile` — returns `null` (not throw) for a missing path — not covered
- **G2** — `fsaAdapter.ts` `readFile`/`writeFile` — byte-exact round-trip of a `Uint8Array` (binary), no UTF-8 mangling — not covered
- **G3** — `fsaAdapter.ts` `writeFile` — creates missing intermediate directories for a nested path — not covered
- **G4** — `fsaAdapter.ts` `readdir` — lists entries; returns `[]` for a missing/empty directory — not covered
- **G5** — `fsaAdapter.ts` `rm` — removes a file; idempotent on a missing path — not covered
- **G6** — `fsaAdapter.ts` `stat` — returns `{size}` for existing, `null` for missing — not covered
- **G7** — `fsaAdapter.ts` SSR/unavailable guard: a non-browser env (no handle / `typeof window === "undefined"`) rejects with typed `{kind:"unavailable"}`, never a raw `TypeError` — not covered
- **G8** — `fsaAdapter.ts` permission-loss mapping: an underlying handle op throwing `NotAllowedError`/`SecurityError` rejects with `{kind:"fsa-permission-revoked"}` (NOT a generic `io` error, NOT swallowed) — not covered
- **G9** — `fsaAdapter.ts` quota mapping: an underlying `QuotaExceededError` on write rejects with `{kind:"quota-exceeded", substrate:"fsa"}` — not covered
- **G10** — `fsaAdapter.ts` traversal defense-in-depth: a path with `..`/backslash segment rejects with `{kind:"io"}` rather than resolving (parity with OPFS C1) — not covered
- **G11** — `mirrorFs.ts` write path: `writeFile` writes to the primary (OPFS) synchronously and resolves once the primary write completes (does NOT block on the mirror) — not covered
- **G12** — `mirrorFs.ts` mirror success: after a `writeFile`, the async mirror eventually writes the same bytes to the FSA mirror, and `getMirrorStatus()` transitions pending→ok with a truthful ack — not covered
- **G13** — `mirrorFs.ts` mirror retry: a mirror write that fails the first N−1 attempts and succeeds on attempt N ends `ok` (backoff path exercised) — not covered
- **G14** — `mirrorFs.ts` mirror exhaustion: a mirror write that fails all attempts ends status `failed` carrying the typed `CorpusError`, and an ack listener is notified — NOT silently swallowed (DD-009 §Failure-driven) — not covered
- **G15** — `mirrorFs.ts` read fallthrough: `readFile`/`stat` return the primary's value when present; when the primary returns `null` they fall through to the mirror and return the mirror's value (browser-storage-clear recovery) — not covered
- **G16** — `mirrorFs.ts` read no-mirror: with no mirror configured, `readFile`/`stat`/`readdir`/`rm`/`writeFile` behave exactly as the bare primary (mirror is optional) — not covered
- **G17** — `mirrorFs.ts` readdir union/fallthrough: `readdir` returns primary names, falling through to the mirror when the primary dir is empty/missing — not covered
- **G18** — `mirrorFs.ts` rm propagation: `rm` removes from the primary and enqueues the same `rm` to the mirror (no orphaned mirror file) — not covered
- **G19** — `mirrorFs.ts` mirror-permission-revoked: a mirror op rejecting `fsa-permission-revoked` sets status `failed` with that kind (drives the S5 re-grant UI) and does NOT fail the primary write — not covered
- **G20** — `mirrorFs.ts` still passes the shared `CorpusFS` contract when wrapping two in-memory fakes (substitutability: a mirror IS a `CorpusFS`) — not covered
- **G21** — `fsaPicker.ts` `pickFolder`: `window.showDirectoryPicker` absent (SSR/unsupported) → typed `{kind:"unavailable"}`, not a `TypeError` — not covered
- **G22** — `fsaPicker.ts` `pickFolder`: user cancels (`AbortError`) → resolves to `null`/"not connected", NOT a thrown failure — not covered
- **G23** — `fsaPicker.ts` permission: `ensurePermission` calls `queryPermission`; if `"granted"` resolves true without prompting; if `"prompt"` calls `requestPermission`; if the request returns `"denied"` → `{kind:"fsa-permission-revoked"}` — not covered
- **G24** — `fsaPicker.ts` handle persistence: `saveHandle`/`loadHandle` round-trip a handle through IndexedDB (mocked) and `loadHandle` returns `null` when none stored — not covered
- **G25** — `storeAdapter.ts` selection: flag OFF → localStorage (S1 invariant, unchanged); flag ON + no folder → bare OPFS (S1 behavior, unchanged); flag ON + folder connected → mirror composite (new branch) — partially covered (S1 covers the first two); the new third branch — not covered

## Recommended Tests

#### FSA adapter via shared contract suite (over a fake handle)

**Closes gaps:** G1, G2, G3, G4, G5, G6, G20-adjacent
**Type:** contract
**Priority:** high
**File:** `app/lib/corpus/__tests__/fsaAdapter.contract.test.ts`
**What it verifies:** the FSA adapter honors the identical `CorpusFS` contract as OPFS and the in-memory fake (substitutability/LSP) when driven over a Map-backed fake `FileSystemDirectoryHandle`.
**Key cases:** run `defineCorpusFsContract("fsa adapter (fake handle)", () => createFsaCorpusFs(makeFakeDirHandle()))` — inherits all 7 contract cases (null-on-missing, 256-byte round-trip, nested create+readdir, rm idempotent, 30-files access pattern, overwrite-in-place).
**Setup needed:** a `makeFakeDirHandle()` test helper (recursive Map-backed fake mirroring the OPFS test's `fakeRoot`, but shaped as a real FSA `FileSystemDirectoryHandle`: `getFileHandle`/`getDirectoryHandle`/`removeEntry`/`values()` or `entries()`/`keys()`). Lives in `__tests__/fakeFsaHandle.ts` so the mirror tests reuse it.

#### FSA adapter error-mapping (permission / quota / unavailable / traversal)

**Closes gaps:** G7, G8, G9, G10
**Type:** unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/fsaAdapter.test.ts`
**What it verifies:** every failure reifies into the typed `CorpusErrorKind`, never a raw throw or swallow.
**Key cases:**
- create adapter with `undefined` handle (or stub `window` absent) → every method rejects `{kind:"unavailable"}` (assert on `err.kind`)
- fake handle whose `createWritable`/`getFileHandle` throws `DOMException("...", "NotAllowedError")` (and separately `"SecurityError"`) → `{kind:"fsa-permission-revoked"}`
- fake handle throwing `DOMException("quota","QuotaExceededError")` on write → `{kind:"quota-exceeded", substrate:"fsa"}`
- `writeFile("workspaces/s/../../escape.txt", ...)` → `{kind:"io"}` (traversal rejected, not resolved)
**Setup needed:** the fake-handle helper with per-op throw injection; assert via `instanceof CorpusError` + `detail.kind` (no string matching).

#### Mirror write/read/retry/ack behavior (two in-memory fakes)

**Closes gaps:** G11, G12, G13, G14, G15, G16, G17, G18, G19
**Type:** unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/mirrorFs.test.ts`
**What it verifies:** the composite writes primary-sync + mirror-async-with-retry, reads with fallthrough, and surfaces mirror failure truthfully (no silent fallback).
**Key cases:**
- write → primary fake has the bytes immediately; `getMirrorStatus()` is `pending`, then `ok` after advancing timers; mirror fake has the bytes (G11, G12)
- mirror fake configured to fail attempts 1–2 then succeed → after backoff timers, status `ok` (G13)
- mirror fake always fails → status `failed` with `err.detail.kind` set; a registered ack/`onMirror` listener received the failure; the primary write still resolved (G14)
- mirror fake throws `fsa-permission-revoked` → status `failed` kind `fsa-permission-revoked`, primary unaffected (G19)
- `readFile` present in primary → primary value; primary returns `null`, mirror has it → mirror value (fallthrough); neither → `null` (G15)
- no mirror configured → behaves as bare primary for all 5 ops (G16)
- `readdir` falls through to mirror when primary dir empty (G17)
- `rm` removes from primary and enqueues `rm` to mirror (mirror file gone after flush) (G18)
**Setup needed:** two `createInMemoryCorpusFs()` + a fault-injecting wrapper (`failNTimes(fs, n)` / `alwaysFail(fs, kind)`); `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync()` to drive backoff; spy on the ack listener.

#### Mirror passes the shared CorpusFS contract

**Closes gaps:** G20
**Type:** contract
**Priority:** medium
**File:** `app/lib/corpus/__tests__/mirrorFs.contract.test.ts`
**What it verifies:** a mirror composite is itself a valid `CorpusFS` (so the store can bind to it through the existing seam).
**Key cases:** `defineCorpusFsContract("mirror (two in-memory)", () => createMirrorCorpusFs({primary: createInMemoryCorpusFs(), mirror: createInMemoryCorpusFs()}))`. Note: contract cases that assert `readdir` exact ordering must remain satisfied by the union/fallthrough — verify the contract still passes (if union ordering conflicts, the mirror's readdir must sort, matching the contract's sorted expectation).
**Setup needed:** none beyond the in-memory fake.

#### Folder-pick + permission + handle persistence

**Closes gaps:** G21, G22, G23, G24
**Type:** unit
**Priority:** medium
**File:** `app/lib/corpus/__tests__/fsaPicker.test.ts`
**What it verifies:** the picker handles the user-gesture API, cancel, permission query/request, and (mocked) IndexedDB persistence without ever touching `window` at import time.
**Key cases:**
- `window.showDirectoryPicker` undefined → `pickFolder()` rejects `{kind:"unavailable"}` (G21)
- `showDirectoryPicker` throws `DOMException("","AbortError")` → `pickFolder()` resolves `null` (cancel is a no-op, not a failure) (G22)
- handle `queryPermission` → `"granted"` ⇒ `ensurePermission` true, `requestPermission` not called; `"prompt"` ⇒ `requestPermission` called; request `"denied"` ⇒ `{kind:"fsa-permission-revoked"}` (G23)
- `saveHandle(h)` then `loadHandle()` returns `h` through a fake IndexedDB; empty store → `null` (G24)
**Setup needed:** stub `window.showDirectoryPicker`; a fake `FileSystemDirectoryHandle` with `queryPermission`/`requestPermission`; a mock IndexedDB (or inject the IDB get/set as functions so the test passes an in-memory map — preferred, avoids a full IDB fake).

#### Store-adapter third branch (folder connected → mirror)

**Closes gaps:** G25
**Type:** integration
**Priority:** high
**File:** `app/lib/corpus/__tests__/storeAdapter-s2.test.ts`
**What it verifies:** the existing flag-OFF and flag-ON/no-folder selections are unchanged (S1 parity), and a connected folder routes the store through the mirror composite.
**Key cases:**
- flag OFF → `resolveWorkspaceStorage()` returns the debounced-localStorage adapter; `navigator.storage`/`showDirectoryPicker` never touched (S1 invariant)
- flag ON + no connected folder → bare OPFS-backed storage (S1 behavior preserved)
- flag ON + an injected connected FSA `CorpusFS` → storage routes writes to a mirror composite (primary OPFS + that FSA), verified by a spy on which fs received the write
**Setup needed:** the selection must be dependency-injectable (pass the FSA `CorpusFS`/connection state in) so the in-memory fake can stand in for both substrates without OPFS/FSA — mirrors S1's flag-routing test injection.

## What NOT to Test

- **Real FSA durability / real `showDirectoryPicker` UI** in unit tests — jsdom can't, and "write returned" ≠ "bytes on disk" (research Gotchas). Defer to the out-of-CI manual/Playwright smoke (`docs/spikes/corpus-fsa-smoke.md`), tracked as a pre-merge manual gate, not a CI unit test.
- **Real IndexedDB structured-clone of a real `FileSystemDirectoryHandle`** — only real browsers can serialize a handle; the unit test mocks the IDB get/set and uses a fake handle. The real round-trip is a smoke-doc item.
- **OPFS adapter internals** — covered by S1; S2 reuses it unchanged.
- **iso-git / commit / push** — S3 scope, not S2.
- **The S5 "saved" status indicator UI** — S2 emits the ack signal; the UI that consumes it is S5. Test the signal (G12/G14), not a component.
- **Trivial type-only declarations** in any new module — the contract/error-mapping tests cover behavior.

## Coverage Gaps Beyond Current Scope

**1.** Real-browser FSA behavior (Chrome/Edge; Firefox/Safari lack `showDirectoryPicker`) and the real handle-permission lifecycle across a browser restart are unmeasured — covered only by the out-of-CI smoke. This is the FSA analog of S1's deferred OPFS Playwright smoke and must run before the flag is enabled anywhere shared.
**2.** Multi-tab contention writing the same FSA folder (two tabs, same handle) is untested and will matter by S4; flag now, cover when concurrent access is introduced.
**3.** The store-side `await`/debounce of the async corpus seam (the other half of S1 review C4) — S2 makes the mirror ack *exist and be truthful*; wiring it so zustand actually awaits/debounces and the S5 status UI consumes it is S5 scope. Flagged so it is not silently dropped.
**4.** `walkDir` per-op directory re-resolution (C3) under S4's files-per-artifact layout — a cross-adapter perf concern (OPFS + FSA both), deferred to the S3/S4 handle-cache refactor.

## Summary

The highest-value tests are the **FSA shared-contract suite over a fake handle** (proves the new adapter is substitutable for OPFS, the entire structural bet of S2) and the **mirror retry/ack test** (proves a mirror failure surfaces truthfully rather than being swallowed — the DD-009 §Failure-driven mandate and the specific iso-git pre-mortem narrative #4). The main residual risk after this plan is the same as S1's: **real FSA/permission behavior diverges from the fake handle** — mitigated, not eliminated, by the deferred manual/Playwright smoke (Beyond-scope gap 1). Open questions surfaced by enumeration: read-fallthrough granularity (resolved to per-path in the plan) and whether `readdir` should union both substrates' names or fall through only when the primary is empty (resolved to sorted union/fallthrough so the shared contract's sorted expectation still holds — G17/G20).
