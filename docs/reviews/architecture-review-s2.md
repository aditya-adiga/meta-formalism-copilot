# Architecture Review — DD-009 corpus S2 (FSA folder mirror) plan

**Scope:** planned S2 modules `app/lib/corpus/fsaAdapter.ts`, `mirrorFs.ts`, `fsaPicker.ts` + the third branch in `app/lib/corpus/storeAdapter.ts`; reviewed against the committed S1 module and DD-009.
**Date:** 2026-06-01
**Based on:** docs/working/plan-corpus-s2.md (this review is the /architecture-review gate self-applied to the plan before implementation; folded back into the plan's Failure-modes section).

> No code-fact-check report provided — this review is of a *plan*, not committed code, so behavioral claims are about the design intent, not stale comments. The committed S1 surface (`types.ts`, `opfsAdapter.ts`, `storeAdapter.ts`) was read directly.

## Scope check

- **Module structure:** YES — three new modules under `app/lib/corpus/`.
- **Public APIs:** YES — new exported `createFsaCorpusFs`, `createMirrorCorpusFs` (+ `getMirrorStatus`/ack surface), `pickFolder`/`ensurePermission`/`saveHandle`/`loadHandle`.
- **Data models:** NO — no new persisted contract; reuses `CorpusFS` bytes+paths and the existing `CorpusErrorKind`. (Persisted `FileSystemDirectoryHandle` in IndexedDB is an opaque browser handle, not a schema consumers parse.)
- **Cross-cutting concerns:** YES — the storeAdapter composition root (DI seam) and a new error-handling/retry pipeline (the mirror).

Two of four categories apply → review proceeds.

## Dependency Map

Intended direction (volatile → stable), all within `app/lib/corpus/`:

```
storeAdapter.ts (composition root)
   ├─→ flag.ts            (stable)
   ├─→ opfsAdapter.ts ──┐
   ├─→ fsaAdapter.ts  ──┤─→ types.ts (CorpusFS, CorpusError, CorpusErrorKind)  [stable core]
   ├─→ mirrorFs.ts    ──┘        ▲
   │       └─ composes two CorpusFS instances (primary, optional mirror)
   └─→ fsaPicker.ts ─→ types.ts  (returns a FileSystemDirectoryHandle + typed errors)
```

`types.ts` remains the stable sink everything points at; no new module is depended on *by* `types.ts`. The store (`workspaceStore.ts`) continues to bind only to `resolveWorkspaceStorage()` and never sees a concrete adapter — the S1 arch-review finding-3 invariant. The mirror depends only on the `CorpusFS` *interface* of its primary and mirror, not on the OPFS/FSA concretions, so it composes any two adapters (and the in-memory fake in tests).

## Findings

#### F1 — `mirrorFs` adds a retry/error-handling pipeline (a cross-cutting concern) as a `CorpusFS` decorator — confirm it stays a decorator, not a new God-object

**Severity:** Informational
**Location:** planned `app/lib/corpus/mirrorFs.ts`
**Move:** #2 (responsibility boundaries), #8 (extension points)
**Confidence:** High

The mirror is the right shape: a decorator that *is* a `CorpusFS` and *wraps* two `CorpusFS` instances, adding the async-mirror + retry + ack responsibility on top of a plain primary. This is OCP-clean — adding FSA mirroring extends the composition rather than modifying the OPFS adapter or the store. The risk is scope creep: if debounce, the S5 status-UI state machine, and S3 push-ack all accrete into this one file it becomes a God-object. **Recommendation:** keep `mirrorFs` to exactly mirror-on-write + read-fallthrough + the ack surface; the *consumer-side* debounce/await (S1 review C4's other half) and the status *UI* belong in S5, not here. The ack surface should be a minimal observable (`getMirrorStatus()` + an `onMirror(cb)` subscription), not a UI-aware type.

#### F2 — the storeAdapter third branch is a growing if/else in the composition root — acceptable now, watch the arm count

**Severity:** Minor
**Location:** planned change to `app/lib/corpus/storeAdapter.ts:74-79` (`resolveWorkspaceStorage`)
**Move:** #8 (extension points), #2 (SRP)
**Confidence:** High

S1's `resolveWorkspaceStorage` is a two-arm selector (localStorage default vs OPFS). S2 adds a third arm (flag ON + folder connected → mirror). A composition root *is* the right place for this kind of wiring decision, so a three-arm conditional is pragmatically fine and not worth a registry/strategy abstraction yet. But S3 will want a fourth arm (worker-proxy) and S4 a fifth (folder-layout vs blob). **Recommendation:** keep the selection logic in `storeAdapter` but factor the "which `CorpusFS` to build" decision into a single small `resolveCorpusFs()` helper returning a `CorpusFS`, separate from the `StateStorage` wrapping, so future arms add to one focused function and the store wrapping stays untouched. Do not over-engineer beyond that in S2.

#### F3 — `fsaPicker` must not become a hidden second composition root / global singleton for the connected handle

**Severity:** Coupling
**Location:** planned `app/lib/corpus/fsaPicker.ts` + its use from `storeAdapter.ts`
**Move:** #3 (module boundary), #7 (coupling surface)
**Confidence:** Medium

The connected-folder state (the live `FileSystemDirectoryHandle` + permission status) has to live somewhere the storeAdapter can read to decide the third arm. The tempting wrong turn is a module-level mutable singleton in `fsaPicker` that `storeAdapter` reaches into — that is content coupling (storeAdapter depends on picker internals) and makes the selection untestable without the picker. **Recommendation:** `fsaPicker` should be a pure-ish function module (`pickFolder`, `ensurePermission`, `saveHandle`/`loadHandle`) that *returns* handles/status; the "currently connected FSA `CorpusFS`" should be passed *into* the selection (dependency-injected), exactly as S1 injects the fake into the flag-routing test. The composition root owns the wiring; the picker owns the browser-API mechanics. This keeps `storeAdapter`'s new branch unit-testable with an in-memory fake (test G25).

#### F4 — read-fallthrough is a Liskov-sensitive postcondition change — keep it contract-faithful

**Severity:** Coupling
**Location:** planned `mirrorFs.ts` `readFile`/`stat`/`readdir`
**Move:** #6 (substitutability)
**Confidence:** High

The mirror is substituted for a bare OPFS `CorpusFS` through the existing seam, so it MUST satisfy the shared `defineCorpusFsContract` (test G20). Two LSP hazards: (a) `readdir` must still return a **sorted** name list even when unioning/falling-through to the mirror (the contract asserts sorted, e.g. `["s"]`, `["artifacts"]`), and (b) fallthrough must not *weaken* the "null means absent" postcondition — a `readFile` that finds nothing in *either* substrate still returns `null`, never a thrown not-found. **Recommendation:** run the shared contract suite against the mirror (planned), and have `readdir` sort the merged set; treat fallthrough purely as "primary `null` → try mirror," never as an error-suppression path.

#### F5 — error-kind discipline: FSA failures reuse the single `CorpusErrorKind` source; do not mint adapter-specific kinds

**Severity:** Minor
**Location:** planned `fsaAdapter.ts` / `mirrorFs.ts` error mapping; consumes `app/lib/corpus/types.ts:41-49`
**Move:** #5 (interface segregation), #3 (module boundary)
**Confidence:** High

`fsa-permission-revoked`, `browser-storage-cleared`, and substrate-tagged `quota-exceeded` already exist in the single `CorpusErrorKind` union. S2 must map FSA `NotAllowedError`/`SecurityError`→`fsa-permission-revoked` and `QuotaExceededError`→`{quota-exceeded, substrate:"fsa"}` using those existing kinds, and add nothing to the union (no `fsa-io`, no `mirror-failed`). The mirror's *status* (`pending`/`ok`/`failed`) is a separate, mirror-local state type — it carries a `CorpusError` on `failed` but does not extend the error union. **Recommendation:** no change to `types.ts`; assert in tests that the mapped `detail.kind` is one of the existing kinds. This preserves the exhaustiveness guarantee S5's status UI relies on.

#### F6 — git stays out of `CorpusFS`; the mirror composes FS only

**Severity:** Informational
**Location:** planned `mirrorFs.ts`
**Move:** #5 (ISP)
**Confidence:** High

The mirror operates over two `CorpusFS` instances and exposes no git/commit/push surface — S3's `CorpusGit` will layer *over* a `CorpusFS` (which may be the mirror). Confirmed the plan does not widen `CorpusFS` or the mirror to anticipate git. Good.

## What Looks Good

- **Decorator-over-interface composition** (mirror wraps two `CorpusFS`) keeps the new substrate and the retry concern additive and OCP-clean; the store and the OPFS adapter are untouched.
- **Single stable core** (`types.ts`) is preserved — no new dependency points *into* it, dependency direction stays volatile→stable.
- **DI seam reuse** — binding through `resolveWorkspaceStorage`/`CorpusFS` means S2 is a drop-in at the same composition root S1 established; no new public surface leaks into the store.
- **Error-kind single-source discipline** — reusing the existing substrate-neutral kinds rather than minting FSA-specific ones keeps the exhaustiveness contract intact for S5.
- **Substitutability is tested, not assumed** — the plan runs the shared contract suite against both the FSA adapter and the mirror.

## Overall Assessment

The S2 plan is structurally sound and consistent with the S1 architecture: it adds a substrate (FSA) and a composition (mirror) without reversing any dependency, widening the stable core, or putting git on `CorpusFS`. No **Structural**-severity findings. The two **Coupling** findings (F3 connected-handle ownership, F4 LSP-faithful fallthrough) are the ones to honor during implementation — both are addressable by following S1's DI-and-contract-test discipline rather than by new abstractions. F1/F2 are watch-items for S3/S5 scope creep, not S2 blockers. Recommendation: proceed with implementation, folding F3/F4 into the relevant steps and keeping `mirrorFs` minimal per F1.
