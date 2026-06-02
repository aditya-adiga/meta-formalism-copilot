# Test Strategy: DD-009 corpus S0+S1 (CorpusFS interface + OPFS adapter)

**Scope:** planned new module `app/lib/corpus/` (CorpusFS interface, types, layout/manifest, OPFS adapter, feature flag) + wiring into `app/lib/stores/workspaceStore.ts`. No code exists yet — this enumerates the paths the planned S0+S1 code will introduce that need coverage.
**Reviewed:** 2026-06-01

## Test Conventions

Vitest 4 + jsdom + Testing Library. Unit tests for `lib/utils/*` are colocated as `*.test.ts`; store tests live in `app/lib/stores/__tests__/*.test.ts`. Pattern: `describe`/`it`/`expect`; `beforeEach` does `localStorage.clear()` + `useWorkspaceStore.setState(getInitialState())`; debounced writes are flushed with `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)` (workspaceStore-hydration.test.ts:9-13, 63-74). No e2e harness in-repo; real-browser checks are done ad-hoc via Playwright on a spike branch (see docs/spikes/iso-git-browser-smoke.md), not in CI.

**Critical infra fact:** jsdom does **not** implement `navigator.storage.getDirectory()` (OPFS). The OPFS adapter's real I/O cannot be exercised under the Vitest/jsdom suite — it must be tested either (a) against an in-memory `CorpusFS` fake for logic-level equivalence, or (b) in a real browser via Playwright. Unit tests that "pass" by silently skipping absent OPFS would be worse than none.

## Untested Paths Touched by the Change

All paths are in not-yet-written files; lines are indicative of the planned structure. Each is a path the S0+S1 code will introduce with no existing coverage.

- **G1** — `app/lib/corpus/opfsAdapter.ts` `readFile` — returns `null` (not throw) for a missing path — not covered
- **G2** — `app/lib/corpus/opfsAdapter.ts` `readFile`/`writeFile` — byte-exact round-trip of a `Uint8Array` (binary, e.g. PDF bytes), no UTF-8 mangling — not covered
- **G3** — `app/lib/corpus/opfsAdapter.ts` `writeFile` — creates missing intermediate directories for a nested path (`workspaces/<slug>/artifacts/semiformal/v0001.md`) — not covered
- **G4** — `app/lib/corpus/opfsAdapter.ts` `readdir` — lists entries; returns `[]` (not throw) for a missing/empty directory — not covered
- **G5** — `app/lib/corpus/opfsAdapter.ts` `rm` — removes a file; behavior on missing path (idempotent vs reject) — not covered, and the contract decision itself is open (flag in plan)
- **G6** — `app/lib/corpus/opfsAdapter.ts` `stat` — returns `{size}` for existing file, `null` for missing — not covered
- **G7** — `app/lib/corpus/opfsAdapter.ts` quota-exceeded write — rejects with a typed `CorpusError`/`CorpusWorkerError` of kind `opfs-quota-exceeded` (NOT swallowed by console.warn, unlike workspaceStore.ts:44-46) — not covered
- **G8** — `app/lib/corpus/opfsAdapter.ts` — SSR guard: calling any method in a non-browser/no-`navigator.storage` env rejects with a clear typed error rather than `TypeError: undefined` — not covered
- **G9** — `app/lib/corpus/layout.ts` path builders — produce the exact DD-009 §Folder-layout paths for (workspace manifest, source by id+ext, artifact version N, custom-type def, decomposition) — not covered
- **G10** — `app/lib/corpus/layout.ts` — workspace-slug sanitization: a workspace title with `/`, `..`, or unicode does not escape `<corpus-root>/workspaces/` (path-traversal safety) — not covered
- **G11** — `app/lib/corpus/manifest.ts` — `workspace.json` parse: malformed/absent manifest surfaces as a recoverable typed error, never a silent default-to-empty that masks data loss — not covered
- **G12** — `app/lib/corpus/manifest.ts` — manifest round-trip: serialize→parse preserves source list, per-artifact current-version pointers, custom-type refs — not covered
- **G13** — `app/lib/corpus/flag.ts` — flag OFF (default) → store uses the existing localStorage adapter; no OPFS access occurs — not covered
- **G14** — `app/lib/corpus/flag.ts` — flag ON → store routes reads/writes through CorpusFS — not covered
- **G15** — `app/lib/stores/workspaceStore.ts` (wiring) — with flag ON, an empty OPFS falls through to recover prior state without data loss (or, in S1's reduced scope, starts clean without corrupting localStorage) — not covered; confirm the S1 fallthrough contract before writing
- **G16** — current localStorage round-trip behavior (workspace save/load, custom types, version history, transient-state sanitization) — **partially** covered by workspacePersistence.test.ts and workspaceStore-hydration.test.ts, but not as an explicit *characterization baseline* the OPFS path is asserted equivalent against — the equivalence linkage is the missing arm

## Recommended Tests

#### Characterization baseline for current persistence

**Closes gaps:** G16
**Type:** characterization
**Priority:** high
**File:** `app/lib/stores/__tests__/workspaceStore-characterization.test.ts`
**What it verifies:** the current localStorage round-trip (sources, semiformal/lean, versioned artifacts incl. multi-version history, customArtifactTypes/customArtifactData, transient-state sanitization) before any corpus code is wired — this is the equivalence target.
**Key cases:**
- Save a workspace with a 3-version artifact record → rehydrate → all 3 versions and `currentVersionIndex` preserved
- Save with 2 custom types + custom data → rehydrate → both definitions and their data intact
- `verificationStatus: "verifying"` → persisted as `"none"` (lock existing invariant)
**Setup needed:** existing fake-timer + localStorage.clear pattern; no new infra.

#### In-memory CorpusFS fake + shared CorpusFS contract test

**Closes gaps:** G1, G2, G4, G5, G6
**Type:** contract
**Priority:** high
**File:** `app/lib/corpus/__tests__/corpusFs.contract.test.ts`
**What it verifies:** any `CorpusFS` implementation honors the interface contract (null-on-missing, byte round-trip, readdir-empty, rm semantics, stat). The same suite runs against the in-memory fake (always) and against the OPFS adapter (browser-only, skipped in jsdom with an explicit `it.skipIf`).
**Key cases:**
- `readFile("absent")` → `null`; `stat("absent")` → `null`; `readdir("absent")` → `[]`
- write then read a 256-byte `Uint8Array` with all byte values → identical bytes out
- write nested path → `readdir` of each ancestor shows the child
**Setup needed:** an in-memory `CorpusFS` fake (Map-backed); a shared `describe`-factory the OPFS Playwright test can reuse.

#### OPFS adapter quota + SSR-guard error typing

**Closes gaps:** G7, G8
**Type:** unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/opfsAdapter.test.ts`
**What it verifies:** the adapter reifies failure into the typed error union instead of swallowing/raw-throwing.
**Key cases:**
- `navigator.storage` absent → every method rejects with `{kind:"...", ...}` typed error, message names the cause (diagnostic: assert on `err.kind`, not string match)
- a `writeFile` whose underlying handle throws a `QuotaExceededError`-shaped error → rejects with `kind:"opfs-quota-exceeded"` carrying `needed`/`available` if derivable
**Setup needed:** stub `navigator.storage.getDirectory` with a fake `FileSystemDirectoryHandle` that throws on `getFileHandle`/`createWritable` — exercises the *error-mapping* logic without real OPFS. Diagnostic expectation: failures print `err.kind` and the full typed object.

#### Layout path builders + slug safety

**Closes gaps:** G9, G10
**Type:** unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/layout.test.ts`
**What it verifies:** path builders match DD-009's folder layout exactly and refuse traversal.
**Key cases:**
- `artifactVersionPath(slug,"semiformal",1)` === `workspaces/<slug>/artifacts/semiformal/v0001.md` (zero-padding locked)
- slug from title `"../etc/passwd"` or `"a/b"` → sanitized, never contains `..` or escapes `workspaces/` (diagnostic: print the offending input → produced path on failure)
**Setup needed:** none (pure functions).

#### Manifest serialize/parse round-trip + malformed handling

**Closes gaps:** G11, G12
**Type:** unit (round-trip is property-flavored)
**Priority:** high
**File:** `app/lib/corpus/__tests__/manifest.test.ts`
**What it verifies:** manifest is a lossless, fail-loud contract.
**Key cases:**
- round-trip a manifest with N sources + M artifacts w/ version pointers → deep-equal
- parse `"{ not json"` and parse `"{}"` (missing required fields) → typed recoverable error, NOT a silent empty manifest
**Setup needed:** none.

#### Feature-flag routing

**Closes gaps:** G13, G14, G15
**Type:** integration
**Priority:** medium
**File:** `app/lib/stores/__tests__/workspaceStore-corpus-flag.test.ts`
**What it verifies:** the flag selects the storage path and the OFF default is unchanged.
**Key cases:**
- flag OFF → set+flush → bytes land in localStorage; `navigator.storage.getDirectory` never called (assert via spy)
- flag ON (with in-memory CorpusFS injected) → set+flush → data routed through CorpusFS; localStorage untouched
- flag ON + empty corpus → store initializes without throwing and without corrupting the OFF-path localStorage
**Setup needed:** dependency-inject the CorpusFS into the store/adapter selection so the in-memory fake can stand in (avoids needing OPFS); spy on `navigator.storage`.

## What NOT to Test

- **Real OPFS durability/fsync timing** in unit tests — jsdom can't, and "write returned" ≠ "bytes on disk" (research Gotchas). Defer to a Playwright browser check (mirror the existing iso-git spike harness), tracked as a pre-merge manual step, not a CI unit test.
- **iso-git / commit / push / `git.log`** — entirely out of S1 scope (S3). No `buffer` polyfill work in S1 (nothing imports iso-git yet).
- **FSA folder mirror and permission flows** — S2 scope.
- **Trivial getters/type-only declarations** in `corpus/types.ts` — no logic to exercise; the contract test covers behavior.

## Coverage Gaps Beyond Current Scope

**1.** Real-browser OPFS behavior (Chrome/Firefox/Safari) and OPFS-vs-IndexedDB perf are unmeasured for the *adapter* (the spikes measured lightning-fs/IndexedDB, not an OPFS adapter). A Playwright smoke against the S1 adapter should run before S1 merges to production-default — this is the deferred half of DD-009's spike-validation extension.
**2.** Multi-tab contention on the same OPFS corpus is untested anywhere and will matter by S4 (session model). Flag now; cover when concurrent access is introduced.
**3.** The four *other* localStorage stores (`workspace-sessions-v1`, `metaformalism-sessions`, `evidence-store-v1`) have no characterization baseline; they become relevant in S4's migration, not S1.

## Summary

The highest-value test is the **characterization baseline (G16)** — without it, "the OPFS path behaves like localStorage" is an unverifiable claim, and that equivalence is the entire safety argument for S1. The **shared CorpusFS contract test** run against an in-memory fake is the second pillar: it lets S1 logic be verified in CI despite jsdom lacking OPFS. The main residual risk after this plan is that **real OPFS behavior diverges from the in-memory fake** — mitigated, not eliminated, by the deferred Playwright smoke (Beyond-scope gap 1). Open question surfaced by enumeration: **G5/G15** — the `rm`-on-missing contract and the empty-corpus fallthrough behavior in S1's reduced (no-FSA) scope both need a decision in the plan before their tests can assert anything.
