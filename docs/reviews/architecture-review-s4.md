# Architecture Review — DD-009 corpus S4 (migration + session-model rewrite)

**Scope:** the S4 plan (docs/working/plan-corpus-s4.md): a corpus folder-layout reader/writer over `CorpusFS`, the folder/ref-based session switch replacing `app/page.tsx:124-178`, the one-shot localStorage→corpus migration, and commit-on-write wiring of `CorpusGit.commit()`.
**Date:** 2026-06-01
**Based on:** docs/working/research-corpus-s4.md (self-applied; no separate code-fact-check report — this is a plan review pre-implementation)
**User goal:** Make the original DD-009 session-switch data-loss bug structurally impossible by replacing the lossy blob bridge with corpus folder/ref sessions, and migrate the 5 localStorage stores safely.

> ⚠️ **No code fact-check report provided.** Architectural claims in the plan are reviewed against the actual current code read during research (page.tsx, the stores, the corpus modules), not an independent fact-check pass.

**Trigger evaluation:** FIRES. The plan changes (1) module structure (new folder-layout reader/writer + migration modules under `app/lib/corpus/`), (2) public surface (a new session-switch function + migration entry replacing page.tsx callbacks; new exports), (3) data models (the on-disk folder layout becomes the persisted contract, replacing `PersistedWorkspace` blobs in sessions), and (4) cross-cutting concerns (the storage seam selection in `storeAdapter.resolveCorpusFs`, commit-on-write wiring, the migration composition root). Three of four categories — full review warranted.

## Dependency Map

The intended direction is preserved and is the load-bearing structural property of S4:

- `app/page.tsx` (volatile UI orchestrator) → a new session-switch + migration API (application layer) → `storeAdapter` (composition root) → `CorpusFS` / `CorpusGit` (stable abstractions) → concrete adapters (OPFS/FSA/git worker, leaf infrastructure).
- The new folder-layout reader/writer depends on `paths.ts` + `manifest.ts` (pure, stable) and on the `CorpusFS` interface — NOT on a concrete adapter. This keeps the worker-proxy / FSA-mirror swaps invisible to it (the S1 arch-review finding 3 invariant, carried).
- Migration depends on `localStorage` (reading the 5 keys — a one-shot inbound dependency that is DELETED after migration, so it does not become a permanent coupling) and on `CorpusFS` + the ack source.

The dependency the review must police: the new session/migration code must depend on the `CorpusFS`/`CorpusGit` INTERFACES, never reach into `opfsAdapter`/`gitWorkerClient`/`fsaPicker` internals. The composition root (`storeAdapter.resolveCorpusFs`) stays the only place that picks concrete adapters.

## Findings

#### F1 — Session-switch must be a data operation, not a relocated blob copy
**Severity:** Structural
**Location:** plan §Approach / §Steps (replacing `app/page.tsx:124-178`)
**Move:** #2 (responsibility boundaries), #4 (layer violations)
**Confidence:** High

The tempting wrong turn (documented in research §Gotchas and seam doc) is to wire the store's own `getSnapshot`/`resetToSnapshot` into the session hooks. That keeps the blob-snapshot responsibility in the application layer and leaves the data-drift bug class structurally re-introducible. S4's whole point is to move session-switch to "load a different folder/ref," so the active workspace's data ALWAYS comes from the target folder, never from a copy of prior in-memory state. The plan must NOT route through `PersistedWorkspace` blobs for the corpus path.
**Recommendation:** the new session-switch reads the target workspace folder via the folder-layout reader into the store; the store's `customArtifactTypes`/`customArtifactData`/`artifacts` are REPLACED wholesale from the folder (a full reset, not a partial `setState` merge — partial merge is what caused the custom-type bleed). Keep the page.tsx callbacks only for the flag-OFF localStorage path; the corpus path bypasses them.

#### F2 — Migration is a composition-root concern; keep it out of the store and the hooks
**Severity:** Coupling
**Location:** plan §Steps (migration module + trigger)
**Move:** #2 (responsibility boundaries), #7 (coupling surface)
**Confidence:** High

Migration reads 5 stores, writes the corpus, backs up, deletes localStorage, and writes a done-marker. If this logic lands inside `workspaceStore.ts` (next to `migrateFromV2`) or inside `useWorkspaceSessions`, those modules acquire a second reason to change and a dependency on `CorpusFS` + the ack source they otherwise don't need. `migrateFromV2` is a localStorage→localStorage in-store concern; the corpus migration crosses substrates and belongs in its own module.
**Recommendation:** put migration in a dedicated `app/lib/corpus/migration.ts` (NOT a reserved Next.js name) that depends on `CorpusFS`, the folder-layout writer, and an injected ack source; trigger it from the composition root / a single effect after `isCorpusEnabled()`, injecting `localStorage` so it is unit-testable (test-strategy G6-G9). The store keeps `migrateFromV2` only for the legacy v2→zustand inbound during migration.

#### F3 — The ack source for the delete gate is a real interface dependency — inject it, don't reach for it
**Severity:** Coupling
**Location:** plan §Steps (migration delete step; pre-mortem #1)
**Move:** #5 (interface segregation), #7 (coupling)
**Confidence:** High

The delete-after-ack gate (pre-mortem #1) needs a truthful "bytes are safe" signal: `mirrorFs.getMirrorStatus()` when a folder is connected, or `CorpusGit.commit()` returning an oid. If migration calls these concrete modules directly it couples to both. The plan should define a narrow ack abstraction (e.g. `() => Promise<void>` that resolves only on a truthful ack, or a small `{ awaitDurable(): Promise<void> }` interface) provided by the composition root based on which mode is active (OPFS-only / FSA / git).
**Recommendation:** add a one-method ack interface to the migration's deps, resolved in `storeAdapter` (the existing composition root) the same way `resolveCorpusFs` resolves the FS. This keeps migration testable with a stub ack (test-strategy G8) and avoids migration knowing about mirror vs git.

#### F4 — Commit-on-write wiring is cross-cutting; gate it at the boundary, not in the write
**Severity:** Coupling
**Location:** plan §Steps (commit-on-write; pre-mortem #2)
**Move:** #2 (SRP), #7 (coupling), #8 (extension points)
**Confidence:** Medium

If commit-on-write hooks every `CorpusFS.writeFile` or every store `setState`, the storage seam acquires git knowledge (violating the deliberate `CorpusFS`/`CorpusGit` separation S3 established — seam doc §S3, ISP) and produces the commit storm of pre-mortem #2. Commits belong on LOGICAL save boundaries (session switch, generate, explicit save, migration-complete), which are application-layer events, not storage-layer events.
**Recommendation:** wire `CorpusGit.commit()` at the application boundary (the session-switch function, the generate/edit handlers) — NOT inside `createCorpusBackedStorage` and NOT on `CorpusFS.writeFile`. Migration commits exactly once at the end. The storage seam stays git-unaware. Keep `CorpusGit` injected, never imported as a global (S3 arch-review F3 invariant).

#### F5 — The on-disk folder layout is now a consumer contract; version it and fail loud
**Severity:** Coupling
**Location:** plan §Steps (folder-layout writer; `workspace.json`)
**Move:** #3 (module boundary / data model)
**Confidence:** Medium

`PersistedWorkspace` was an internal blob; the folder layout is explicitly external (DD-009 F10 — `git log`/`grep`/`vim` read it). That makes `workspace.json` + the `v####.md`/`meta.json` conventions a published contract. `manifest.ts` already fails loud (`parseManifest` throws, never default-empty) and carries `manifestVersion` — good. The risk is the per-version `meta.json` provenance shape drifting silently.
**Recommendation:** reuse `MANIFEST_VERSION` discipline for `meta.json` (a version field + fail-loud parse), and document the layout contract in the plan + CLAUDE.md so a future artifact-type addition extends the convention rather than mutating it. Do not let migration write a layout the reader can't fail-loud on.

#### F6 — Deleting the page.tsx bridge narrows the public surface — confirm no other consumer binds to it
**Severity:** Minor
**Location:** `app/page.tsx:124-178` + the `WorkspaceSnapshotFns` contract (useWorkspaceSessions.ts:13-23)
**Move:** #3 (module boundary)
**Confidence:** Medium

`getWorkspaceSnapshot`/`resetWorkspaceToSnapshot`/`clearWorkspace` are passed as the `WorkspaceSnapshotFns` contract into `useWorkspaceSessions`. The OFF path still needs them; the corpus path must not. The plan should keep the hook's contract intact for OFF and add the corpus path as a sibling, rather than mutating `WorkspaceSnapshotFns` (which would force the OFF path to change for a corpus reason).
**Recommendation:** add the corpus session-switch as a separate path selected by `isCorpusEnabled()` at the call site; leave `WorkspaceSnapshotFns` and the localStorage hooks untouched. This preserves the OFF path byte-for-byte (research invariant) and keeps the two models from coupling.

## What Looks Good

- The `CorpusFS`/`CorpusGit` separation (S3 ISP) is the right foundation for F4 — git stays off the storage seam by construction.
- `paths.ts` as the single traversal choke point + `manifest.ts` fail-loud codec mean the folder-layout writer inherits sanitization and the reader inherits non-silent-empty — both load-bearing for migration safety.
- `resolveCorpusFs` already exists as the focused composition-root selector (storeAdapter.ts:92-100) with a "add future arms here" comment — F3's ack resolution and F2's migration trigger have a clean home.
- The production guard in `flag.ts` is exactly the right safety interlock; the plan correctly defers flipping it (pre-mortem #5).

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| F1 | Session-switch must be a data op, not a relocated blob | Structural | plan §Approach / page.tsx:124-178 | High |
| F2 | Migration belongs in its own module, off the store/hooks | Coupling | plan §Steps / new migration.ts | High |
| F3 | Inject the delete-gate ack source, don't reach for it | Coupling | plan §Steps (delete step) | High |
| F4 | Commit-on-write at the app boundary, not the write | Coupling | plan §Steps (commit-on-write) | Medium |
| F5 | Folder layout is a consumer contract — version + fail loud | Coupling | plan §Steps (folder writer) | Medium |
| F6 | Narrow the bridge surface without mutating the OFF contract | Minor | page.tsx:124-178 | Medium |

## Overall Assessment

The plan improves the system's structural integrity: it removes the blob-snapshot responsibility from the application layer and makes session-switch a data-level operation, which is exactly the change that kills the bug class (F1). The dependency direction is correct as long as the new code binds to `CorpusFS`/`CorpusGit` interfaces and the composition root (`storeAdapter`) stays the only place picking concrete adapters — F2/F3/F4 all defend that boundary. The single most important structural concern is F1: if implementation backslides into "wire the store snapshot into the session hooks," S4 ships a better blob model instead of the corpus model and the bug remains structurally possible. All findings are fixable in the plan as written (they are placement/injection decisions, not redesigns); none indicates a need to restructure the S0–S3 foundation. Findings folded into the plan: F1→§Approach + §Steps (folder/ref switch, wholesale reset); F2→§Steps (`migration.ts`); F3→§Steps (injected ack); F4→§Steps (commit at boundary); F5→§Steps + docs; F6→§Steps (sibling path).
