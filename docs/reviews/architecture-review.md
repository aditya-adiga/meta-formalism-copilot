# Architecture Review — DD-009 corpus S0+S1 plan (plan-stage, no diff)

**Scope:** `docs/working/plan-corpus-s1.md` — proposed `app/lib/corpus/` module (CorpusFS interface, layout/manifest, OPFS adapter) + wiring into `app/lib/stores/workspaceStore.ts`
**Date:** 2026-06-01
**Based on:** docs/working/research-corpus-architecture.md, docs/working/decomposition-corpus-architecture.md, docs/decisions/009-artifact-corpus-architecture.md
**User goal:** Validate the CorpusFS module boundary, dependency direction, and the four cross-sub-task contracts *before* any S1 code commits, so S2/S3/S4 can build on S1 without reopening the boundary.

> ⚠️ **No code fact-check report provided.** This is a plan-stage review of proposed structure — there is no code to fact-check yet. Architectural claims are assessed against the plan/decomposition/decision docs, not against an implementation.

> Note: this review evaluates *proposed* structure (the plan describes files that don't exist). Findings are directives to shape the implementation, not defects in existing code. Re-run against the real diff after S1 is implemented.

## Dependency Map

Proposed direction (all arrows = "depends on"):

```
workspaceStore (volatile, app state)
      │  via injected seam
      ▼
  CorpusFS  ◄────────── opfsAdapter (volatile detail: OPFS)
 (abstraction)  ◄────── inMemoryFake (test detail)
      ▲
      └── layout.ts / manifest.ts (pure contracts; depend on nothing app-side)

later: S2 fsaMirror, S3 gitPipeline(worker), S4 migration  → all depend on CorpusFS
```

This is the correct shape: the volatile store and the volatile OPFS detail both depend on the stable `CorpusFS` abstraction (Dependency Inversion). `app/lib/corpus/` is a leaf module depending only on browser APIs and pure code — no inward dependency from corpus back into stores/hooks/components. Good.

## Findings

#### Substrate-specific failure kinds leak into the shared error contract; two parallel error types risk drift

**Severity:** Coupling
**Location:** `app/lib/corpus/types.ts` (planned) — `CorpusError` / `CorpusWorkerError` (plan step 1; decomposition "CorpusWorkerError" contract)
**Move:** #3 (module boundary), #7 (coupling surface)
**Confidence:** Medium

The `CorpusWorkerError` union is a contract S2/S3/S4/S5 all switch on, but it names `opfs-quota-exceeded` — an OPFS-substrate-specific kind — directly in the shared type. When S2 (FSA) or a future non-OPFS cache reports a quota/space failure, consumers either reuse the OPFS-named kind (misleading) or a second kind is added and every exhaustive switch must handle both. Separately, the decomposition posits `CorpusError` as "the non-worker sibling" of `CorpusWorkerError` — two types with an overlapping `kind` set, which will drift the moment S3 introduces the worker and someone updates one but not the other.

**Recommendation:** Make the `kind` set the single source of truth (one `CorpusErrorKind` enum/union consumed by both a thrown `CorpusError` and the postMessage-serialized `CorpusWorkerError`, which should differ only in transport, not in kinds). Prefer a substrate-neutral `quota-exceeded {needed, available, substrate: "opfs"|"fsa"|...}` over baking `opfs-` into the kind name. Settle this in S0 (step 1) since it is the contract S5's exhaustiveness check binds to.

#### Git operations must layer *above* CorpusFS, not widen it — or S3 turns CorpusFS into a fat interface

**Severity:** Minor (Structural if ignored until S3)
**Location:** `app/lib/corpus/types.ts` (planned `CorpusFS`) vs. S3 git pipeline
**Move:** #5 (interface segregation)
**Confidence:** High

`CorpusFS` is correctly scoped to bytes+paths (readFile/writeFile/readdir/rm/stat). S3 needs `commit`/`log`/`push`/`pull`. If those land as methods on `CorpusFS`, the in-memory fake and any non-git consumer must implement or stub git they don't use (the ISP smell: implementors with `NotImplemented` methods). The plan implicitly keeps git separate (S3 "a git working tree *inside* the corpus"), but the S0 contract doesn't state it.

**Recommendation:** In S0, document explicitly that git is a *separate* interface (e.g., `CorpusGit`) that operates *over* a `CorpusFS`, not an extension of it. One sentence in the S0 contract now prevents S3 from widening the foundational interface later.

#### The DI injection seam must be the CorpusFS interface, not the concrete adapter (load-bearing for the S3 worker move)

**Severity:** Coupling
**Location:** `app/lib/stores/workspaceStore.ts` wiring (plan step 7) + `app/lib/corpus/flag.ts`
**Move:** #1 (dependency direction), #6 (substitutability)
**Confidence:** High

DD-009 mandates the OPFS writer eventually run in a dedicated worker (S3). The plan defers the worker but the *only* thing that makes that later move cheap is that the store binds to the `CorpusFS` interface, so a worker-proxy `CorpusFS` can be substituted without touching the store. If step 7 injects the concrete `opfsAdapter` (or types the seam as the adapter class), S3 will have to re-open the store wiring. The plan says "dependency-injected" but types the default as "the localStorage adapter" — confirm the injected type is the `CorpusFS` interface (with the localStorage path also expressed as a `CorpusFS`-shaped or clearly-separated adapter), not a concrete class.

**Recommendation:** Make the injection seam's static type the `CorpusFS` interface. Add an assertion to the flag-routing test (G14) that the store holds something typed as `CorpusFS`, so substituting a worker-proxy in S3 is a drop-in.

#### S1 uses CorpusFS as a blob store; folder-layout/manifest are built but not integration-exercised until S4

**Severity:** Informational
**Location:** plan steps 2–3 (layout/manifest) vs. step 7 (store wiring) and step 9 (Playwright)
**Move:** #2 (responsibility boundaries)
**Confidence:** Medium

S0 builds `layout.ts` + `manifest.ts` (the files-per-artifact contract), but the S1 store wiring writes the existing Zustand persist blob to a single OPFS file (flag-ON empty corpus "initializes clean", no folder mapping). So in S1 the folder layout is unit-tested only; the layout↔store integration is deferred to S4. That's a defensible de-risking order, but it means the *fitness* of `CorpusFS` for the real access pattern (many small `v####.md` files, `readdir` over an artifact dir) rests on the contract test's nested-path/readdir cases (G3, G4), not on an integration test, until S4.

**Recommendation:** Keep the staging, but ensure the contract test deliberately exercises the S4 access pattern (write ~30 small files under one dir, `readdir`, read each back) so the interface is proven fit-for-purpose before S4 commits to it. Note the blob-vs-files staging in the plan so a reviewer doesn't expect files-per-artifact in S1.

#### "Saved" indicator correctly deferred — confirm S1 shows none when the flag is on

**Severity:** Informational
**Location:** S5 sync-ack contract vs. S1
**Move:** #2 (responsibility boundaries)
**Confidence:** High

The sync-ack/"saved"-indicator contract (OPFS-write-ack ≠ "saved") is correctly assigned to S5/S2/S3. Because S1 has no FSA mirror or remote push, there is no truthful "saved" state in S1. The plan adds no save UI in S1, which is right.

**Recommendation:** None required. Just confirm no pre-existing "saved/persisted" affordance becomes misleading when the dev flag is on (it shouldn't, since localStorage's writes were already fire-and-forget with no indicator).

## What Looks Good

- **Dependency direction is correct** — store and OPFS detail both depend on the `CorpusFS` abstraction; `app/lib/corpus/` is a clean leaf with no inward app dependencies.
- **The async interface is worker-ready** — Promise-based signatures mean the S3 worker move is a transport swap, not an interface change (provided the seam typing is fixed per finding 3).
- **Discriminated-union + exhaustiveness check is a clean OCP extension point** — adding a failure kind forces every consumer's switch to handle it at compile time. Strong choice for the failure-driven-UI mandate.
- **The shared contract test enforces LSP** between the in-memory fake and the OPFS adapter — substitutability is verified, not assumed.
- **Default-off flag keeps the boundary reversible** — the whole slice can be reverted with no data-state consequence, which is the right risk posture for a foundational boundary still being proven.

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | Substrate-specific error kinds in shared union + parallel CorpusError/CorpusWorkerError drift | Coupling | `corpus/types.ts` | Medium |
| 2 | Git must layer above CorpusFS, not widen it | Minor | `corpus/types.ts` vs S3 | High |
| 3 | DI seam must be the CorpusFS interface, not the concrete adapter | Coupling | `workspaceStore.ts` wiring | High |
| 4 | Layout/manifest built but not integration-exercised until S4 | Informational | steps 2–3 vs 7 | Medium |
| 5 | Confirm no misleading "saved" indicator in S1 | Informational | S1 vs S5 | High |

## Overall Assessment

The proposed structure **improves** the system's integrity: it replaces an ad-hoc localStorage seam with a properly inverted `CorpusFS` abstraction, and the decomposition's contracts are mostly drawn so S2–S4 can extend rather than reopen the boundary. The single most important structural concern is **finding 3** — the DI seam must be typed as the `CorpusFS` interface, because that one decision is what makes DD-009's mandated worker move (S3) cheap; getting it wrong forces a store rewrite later. Findings 1 and 2 are cheap to settle now (they're S0 contract wording) and expensive to fix once S3/S5 have switched on the kinds. All issues are fixable in the plan/S0 contract stage — none indicate the decomposition itself is mis-structured. Recommend folding findings 1–3 into the S0 steps before implementation begins.
