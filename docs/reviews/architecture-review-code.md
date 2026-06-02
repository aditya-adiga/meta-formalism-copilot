# Architecture Review — feat/corpus-architecture (DD-009 S0+S1, CODE)

**Scope:** `git diff main...HEAD -- app/` (production code in `app/lib/corpus/` + the `app/lib/stores/workspaceStore.ts` wiring change; test files reviewed for boundary evidence only, not as findings)
**Date:** 2026-06-01
**Based on:** code-fact-check report (Stage 1: 11 Verified, 1 Mostly Accurate, 0 Incorrect — CorpusFS has exactly 5 methods/no git; S1 is blob-mode; paths.ts/manifest.ts built but unused by production until S4)
**User goal:** Comprehensive code review of `feat/corpus-architecture` before opening a PR. This pass verifies the *implementation* matches the already-reviewed plan and that the module boundary holds for S2/S3/S4.

> Trust-Boundary Cross-Reference: a `docs/reviews/security-review-*.md` file (the exact convention the integration requires) does **not** exist (`security-review.md` is present but does not match the `security-review-*` glob). Per the activation condition, this section is a no-op and module-boundary findings proceed unmodified.

## Dependency Map

The new `app/lib/corpus/` module forms a clean layered subgraph with dependencies pointing inward toward the stable abstraction:

```
workspaceStore.ts (volatile: Zustand persist wiring)
        │  imports only { resolveWorkspaceStorage }
        ▼
storeAdapter.ts  (composition root / selector)
   │                    │
   │ binds seam as      │ instantiates concrete
   ▼                    ▼
types.ts (CorpusFS  ◄── opfsAdapter.ts (implements CorpusFS)
   interface +
   error model)    ◄── manifest.ts (imports CorpusError only)
                   ◄── paths.ts (no corpus imports; pure string builders)
```

Verified import facts (grep over `app/`, excluding tests):
- `workspaceStore.ts` imports **only** `resolveWorkspaceStorage` from `storeAdapter` — never the concrete OPFS adapter, never `CorpusFS`, never `createOpfsCorpusFs`.
- The single reference to `createOpfsCorpusFs` outside its own definition is inside `resolveWorkspaceStorage` (storeAdapter.ts:73) — the composition root. This is the one and only place the concrete substrate is named.
- `storeAdapter.ts` types its seam as `import type { CorpusFS }` (line 16) and `createCorpusBackedStorage(fs: CorpusFS)` (line 52) depends only on the interface.
- `opfsAdapter.ts` and `manifest.ts` depend on `types.ts` (the stable core); nothing in `types.ts` depends back on them. No cycles.
- `paths.ts` imports nothing from the module — it is a pure leaf.

Dependency direction is correct throughout: volatile (store) → selector → abstraction, with the concrete adapter as a sibling that also points at the abstraction. This is textbook Dependency Inversion.

## Prior-Finding Verification

The plan-stage review folded in three findings. All three are present in the code:

- **Finding 1 (single substrate-neutral error-kind source):** Confirmed. `CorpusErrorKind` (types.ts:41-49) is the one union; `CorpusError.detail` (line 53) and `CorpusWorkerError.detail` (line 64) both reference it. They differ only in transport (`toWorkerError`/`isCorpusWorkerError`), not in the kind set. `CorpusSubstrate` (line 34) is substrate-neutral (`"opfs" | "fsa" | "remote"`) so `quota-exceeded` is reused rather than minting adapter-specific kinds.
- **Finding 2 (git is a separate interface, not on CorpusFS):** Confirmed. `CorpusFS` (types.ts:112-125) has exactly 5 methods: `readFile`, `writeFile`, `readdir`, `rm`, `stat`. No git methods. The docstring (lines 19-22) explicitly reserves `CorpusGit` for S3 with an ISP rationale. (`CorpusGit` is not yet defined, which is correct for S0+S1.)
- **Finding 3 (store seam typed as CorpusFS, not the concrete adapter):** Confirmed. See Dependency Map above — `createCorpusBackedStorage(fs: CorpusFS)` and the `import type { CorpusFS }`.

## Findings

#### F1. `resolveWorkspaceStorage` hard-wires `createOpfsCorpusFs` — the one S1 choice S2/S3 must edit, but it is correctly contained

**Severity:** Informational
**Location:** `app/lib/corpus/storeAdapter.ts:71-76`
**Move:** #1 (dependency direction), #8 (extension points)
**Confidence:** High

`resolveWorkspaceStorage` calls `createCorpusBackedStorage(createOpfsCorpusFs())` directly. This is the single place where the OPFS-only S1 substrate is baked in. The review brief asks specifically whether anything "bakes the OPFS-only S1 choice into a contract S2/S3/S4 must later break" — the answer is **no, it does not bake it into a contract**. The seam *type* is `CorpusFS`, so when S3 introduces a worker-proxy `CorpusFS` or S2 a folder-mirror `CorpusFS`, the change is a one-line edit inside this selector (swap which `create*CorpusFs()` is called), not a signature change that ripples to `workspaceStore.ts` or any consumer. The OPFS dependency is localized to a composition root, which is exactly where a concrete choice belongs. The only structural observation: there is no injection parameter (e.g. `resolveWorkspaceStorage(fs?: CorpusFS)`), so tests of the *selector itself* can't inject a fake — but the seam below it (`createCorpusBackedStorage`) is already injectable and is the unit that is tested, so this is not a real limitation at S1.

**Recommendation:** No change required. When S2/S3 land, the substrate decision (which `CorpusFS` to construct) belongs here and only here; keep `resolveWorkspaceStorage` as the single choke point and do not let consumers reach for `createOpfsCorpusFs` directly. Optionally, when more than one corpus substrate exists, consider a small factory keyed off config rather than growing an if/else chain in this function (OCP) — not warranted yet for one branch.

#### F2. `state/<name>.json` blob path is an internal convention of `createCorpusBackedStorage`, not coupled to the S4 folder layout — good, but undocumented as a deliberate fork

**Severity:** Minor
**Location:** `app/lib/corpus/storeAdapter.ts:52-68`; cross-ref `app/lib/corpus/paths.ts`
**Move:** #2 (responsibility boundaries), #3 (module boundary)
**Confidence:** Medium

S1 stores the whole zustand persist blob as one file at `state/${name}.json` via an inline `pathFor` helper, deliberately bypassing the `paths.ts` builders (which describe the per-artifact folder layout S4 will use). This is the correct call for a "pure substrate swap" — coupling the blob path to `workspaceManifestPath`/`artifactVersionPath` now would be premature. The risk is the opposite of baking-in: `state/` is a *parallel* path namespace that the `paths.ts` layout does not mention. At S4, migration must reconcile "blob at `state/workspace-zustand-v1.json`" with "files under `workspaces/<slug>/...`" and decide the blob's fate (delete? leave as legacy?). Nothing in the code or the `paths.ts` layout comment acknowledges that `state/` exists alongside `workspaces/`, so an S4 implementer reading `paths.ts` alone would not know a second namespace is live. This is a documentation-completeness gap, not a structural defect — the two namespaces don't collide (`state/` vs `workspaces/`).

**Recommendation:** Add one line to the `paths.ts` layout comment (or a `STATE_DIR` const note) recording that S1 also writes a blob under `state/` outside the folder layout, and that S4 migration owns retiring it. This preserves the boundary while leaving a breadcrumb for the consumer who will break the fork on purpose.

#### F3. `manifest.ts` claims fail-loud on absent input but a present-and-valid manifest can silently fabricate `createdAt`/`updatedAt`

**Severity:** Minor
**Location:** `app/lib/corpus/manifest.ts:74-115` (esp. 109-110)
**Move:** #6 (substitutability / contract consistency)
**Confidence:** Medium

The module docstring (lines 11-14) states parsing is FAIL-LOUD — a malformed manifest surfaces as a typed `CorpusError`, "never a silent default." `parseManifest` honors this for the structural fields (`title`, `manifestVersion`, `sources`, `artifacts`, `customTypeIds` all `fail()` when missing/invalid). However, `createdAt`/`updatedAt` are silently defaulted to `new Date().toISOString()` when absent or non-string (lines 109-110). This is a minor inconsistency with the stated "fail-loud" contract: a manifest missing its timestamps is technically malformed but parses cleanly with fabricated values. Because timestamps are metadata (not work content), this won't mask data loss the way a defaulted-empty `sources`/`artifacts` would — so the spirit of the contract (don't masquerade emptiness as "no work") is intact. This is purely a contract/docstring-precision finding, surfaced because the manifest is a persisted data-model contract S4 consumers will bind to. It is *not* a data-model design flaw.

**Recommendation:** Either tighten `parseManifest` to `fail()` on missing timestamps (strict reading of the contract), or narrow the docstring to say timestamps are best-effort recovered while content fields are fail-loud. The latter is likely the intended behavior; documenting it removes the ambiguity for S4.

## What Looks Good

- **The seam is the contract, and it is minimal.** `CorpusFS` is 5 cohesive bytes-and-paths methods (move #5, ISP): every method is needed by every implementor, so the in-memory fake, the OPFS adapter, and the future folder/worker adapters all implement the same lean surface with no `NotImplemented` stubs. Git was correctly kept off it.
- **Error model is single-sourced and substrate-neutral** (move #7, #3). One `CorpusErrorKind` union feeds both the thrown and worker-serialized forms, with an `assertNever` exhaustiveness guard. Adding a kind forces every switch to handle it at compile time — this is the right structural investment for the failure-driven-UI mandate, and it means S2/S3 add cases without re-architecting.
- **The OPFS adapter encapsulates its substrate cleanly** (move #3). All DOMException-to-`CorpusError` translation (`isNotFound`, `isQuota`, `wrap`) and the locally-declared OPFS handle typings are private to `opfsAdapter.ts`. A consumer could swap the entire OPFS implementation for a different async FS and nothing outside the file would change. The SSR/unavailable guard returns a typed error rather than a raw `TypeError`, keeping the abstraction's "everything rejects with CorpusError" promise.
- **Path-traversal containment is single-choke-point** (move #2/#3). `paths.ts` is the only producer of corpus paths, and `workspaceSlug`/`safeSegment` are the one guard against escaping `workspaces/`. Centralizing this in a pure leaf module with no dependencies is the right responsibility placement.
- **The store change is a clean substrate swap** (move #1). The 33-line debounced-localStorage adapter moved verbatim into `storeAdapter.ts` (preserving the OFF path byte-for-byte, per the characterization test) and `workspaceStore.ts` now imports a single selector. The store's responsibility (state shape + actions) did not absorb any storage concern — it delegates entirely.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| F1 | OPFS substrate hard-wired in selector — contained at composition root, not in a contract | Informational | `storeAdapter.ts:71-76` | High |
| F2 | `state/` blob namespace parallel to `paths.ts` layout, undocumented as an S4-reconcile fork | Minor | `storeAdapter.ts:52-68` | Medium |
| F3 | `parseManifest` fabricates timestamps despite "fail-loud" docstring | Minor | `manifest.ts:109-110` | Medium |

## Overall Assessment

This change **improves** the system's structural integrity and introduces no structural or coupling defects. The central architectural question for the PR — does anything bake the OPFS-only S1 choice into a contract S2/S3/S4 must later break? — resolves cleanly: the OPFS dependency is isolated to a single composition root (`resolveWorkspaceStorage`), every consumer binds to the `CorpusFS` abstraction, and the error model is substrate-neutral by construction, so S2 (FSA mirror), S3 (worker proxy), and S4 (folder migration) are drop-in extensions rather than contract breaks. All three prior-review findings are genuinely implemented in code, not merely planned. The only follow-ups are two Minor documentation-precision gaps (the undocumented `state/` namespace fork that S4 migration will own, and the timestamp-defaulting inconsistency with the fail-loud docstring) and one Informational note confirming the OPFS wiring is correctly contained. None block the PR; all are fixable in place with comment-level edits. The single most important structural concern is the smallest: leave an S4 breadcrumb (F2) so the next sub-task's author knows `state/` exists outside the folder layout before they design migration.

---

## Goal-Alignment Note

The review stayed within the stated goal: verifying that the *implementation* of DD-009 S0+S1 matches the already-approved plan and that the `app/lib/corpus/` module boundary holds for later sub-tasks. I confirmed the three prior findings against actual code (not the plan), traced the real import graph to verify the store depends on `CorpusFS` via `resolveWorkspaceStorage` rather than the concrete OPFS adapter, and specifically answered the "baked-in S1 choice" question. Docs were excluded from scope per the brief; test files were read only as evidence of where the boundary is exercised, not scored as findings. No findings were manufactured to pad the report — the diff is structurally sound, so the substantive output is "What Looks Good" plus two doc-precision nits and one informational confirmation.
