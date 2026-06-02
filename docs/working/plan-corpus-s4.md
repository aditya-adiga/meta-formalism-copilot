# Plan: DD-009 corpus S4 — data-model migration + session-model rewrite (the keystone)

- **Goal**: Replace the lossy `app/page.tsx` session-snapshot bridge with folder/ref-based session switching over the corpus folder layout, and run a one-shot, backup-before-delete migration folding the five fragmented localStorage stores into the corpus — so the original DD-009 trigger bug (session switch erases custom-artifact-type references and flattens per-panel version histories) becomes STRUCTURALLY IMPOSSIBLE. All behind the existing default-off, production-guarded flag; the localStorage OFF path stays byte-for-byte until migration runs.
- **Project state**: branch `feat/corpus-s4-migration` off `integration/6.1` (integrates S1+S2+S3); the keystone sub-task — depends on S0 layout + S1 adapter, integrates S2 (mirror ack) + S3 (`CorpusGit.commit()`) which have both landed · blocks only S5's status UI · not blocked.
- **Task status**: plan drafted; pre-mortem + architecture-review both self-applied and folded in; **awaiting user approval at the RPI firm gate before any implementation** (this sub-task migrates data — the gate is non-negotiable; NO app/ code has been written).

Research: docs/working/research-corpus-s4.md
Decomposition: docs/working/decomposition-corpus-architecture.md
Test strategy: docs/working/test-strategy-corpus-s4.md
Pre-mortem: docs/reviews/pre-mortem-s4.md
Architecture review: docs/reviews/architecture-review-s4.md

## Approach

Make session-switch a DATA operation, not a relocated blob copy (arch-review F1). The corpus path loads the target workspace folder into the store wholesale (full reset of `customArtifactTypes`/`customArtifactData`/`artifacts` from disk — never a partial `setState` merge, which is the exact mechanism of the custom-type bleed). The lossy `getWorkspaceSnapshot`/`resetWorkspaceToSnapshot` bridge (page.tsx:124-178) is retired on the corpus path; the localStorage OFF path keeps its existing hooks untouched (arch-review F6). Migration is a one-shot, backup-before-delete conversion in its own composition-root-triggered module (arch-review F2), gated so the localStorage delete fires ONLY after a truthful durability ack (pre-mortem #1, arch-review F3).

**Design decisions resolved here:**
- **Session-switch reads the folder, replaces store state wholesale** (arch-review F1). No `PersistedWorkspace` blob on the corpus path. The two snapshot mechanisms (store-level + page.tsx bridge) both become OFF-path-only; the corpus path bypasses them.
- **Migration lives in `app/lib/corpus/migration.ts`** (not a reserved Next.js name; arch-review F2), depends on `CorpusFS` + the folder-layout writer + an INJECTED ack source + injected `localStorage` (testable). The store keeps `migrateFromV2` only for the legacy v2→zustand inbound.
- **The delete gate uses an injected ack abstraction** (arch-review F3): a one-method `awaitDurable()` resolved by `storeAdapter` based on mode (OPFS-only → an OPFS flush probe; FSA → `mirrorFs.getMirrorStatus()==="ok"`; git → `CorpusGit.commit()` oid). Migration never reaches into mirror/git directly.
- **The backup is written to localStorage** (a single `corpus-migration-backup-v1` key holding the 5 original keys), NOT to OPFS — so it survives an OPFS eviction (pre-mortem #1). It is removed only after the full migration acks and the done-marker is written.
- **Commit-on-write fires at application save boundaries** (session switch, generate, explicit save, migration-complete), NOT on `CorpusFS.writeFile` and NOT on `setState` (arch-review F4, pre-mortem #2). Migration commits exactly once. The storage seam stays git-unaware.
- **The S1 `state/` blob is reconciled then retired** (research §Gotchas; test-strategy G11): if a corpus has only the `state/` blob (flag was on pre-S4), migration folds it into the folder layout and removes `state/`. New corpora are written folder-layout-first.
- **Migration is resumable + per-workspace idempotent** (pre-mortem #3): localStorage stays authoritative until the FULL migration acks; per-workspace done-markers let a re-entered migration skip already-written workspaces; a partial state restores cleanly from localStorage/backup.
- **The `flag.ts` production guard stays in the S4 implementation commit** (pre-mortem #5); flipping it is a SEPARATE follow-up gated on the real-OPFS migration smoke.
- **Raw source bytes are NOT added** in S4 (research invariant): keep storing extracted TEXT only (today's behavior); `sources/<id>.<ext>` byte storage is deferred (out of scope for the bug fix). Flagged, not silently skipped.
- **Evidence store scope** (open question — see below): default to migrating `evidence-store-v1` as a corpus-global file (not per-workspace), matching its current global semantics; confirm with user.

## Steps (one commit each)

1. **Folder-layout writer over `CorpusFS`.** New `app/lib/corpus/folderLayout.ts` (writer half): serialize a `WorkspaceState` → `workspace.json` manifest + `artifacts/<type>/v####.md` per version + per-type `meta.json` (versioned, fail-loud — arch-review F5) + `custom-types/<id>.json` + custom content under `artifacts/custom/<id>/` + decomposition. Apply transient sanitization (`sanitizeVerificationStatus`, `sanitizeNodeStatus`) before write (research invariant). Routes all paths through `paths.ts`. (~220 lines) — Closes G3, G15.
2. **Test-first — writer round-trip + reader.** Folder-layout reader half of `folderLayout.ts` (folder → `WorkspaceState`, `versions[]`+`currentVersionIndex` intact) + `__tests__/folderLayout.test.ts` over the in-memory `CorpusFS` fake. (~260 lines) — Closes G3, G4, G15.
3. **The injected `awaitDurable` ack abstraction + composition-root resolution.** Add a one-method ack interface to `storeAdapter.ts` (resolved by mode: OPFS-only / FSA-mirror / git), per arch-review F3. (~60 lines edit) — foundation for steps 6-7.
4. **Folder/ref session-switch (corpus path).** New session-switch function: read the target workspace folder via the reader, REPLACE store `customArtifactTypes`/`customArtifactData`/`artifacts`/etc. wholesale (arch-review F1); selected at the call site by `isCorpusEnabled()` as a sibling to the OFF-path hooks (arch-review F6, leaves `WorkspaceSnapshotFns` untouched). (~150 lines) — Closes G5.
5. **Test-first — the bug-fix characterization.** `__tests__/sessionSwitch-bugfix.test.ts`: multi-version artifact + custom types survive a switch + back; no cross-session bleed; negative-control through the old bridge documenting the loss S4 fixes. Commit `test:`. (~200 lines) — Closes G1, G2, G5.
6. **Migration module — read 5 stores, write corpus, backup, gated delete.** New `app/lib/corpus/migration.ts` (arch-review F2): read `workspace-zustand-v1`/`workspace-sessions-v1`/`metaformalism-sessions`/`evidence-store-v1`/legacy `workspace-v2`; build folder layout (live zustand authoritative for the active session — pre-mortem #4); write `corpus-migration-backup-v1` to localStorage; write corpus; `awaitDurable()`; ONLY THEN delete the 5 keys; write done-marker; remove backup. Reconcile + retire the `state/` blob. Log any custom type whose content was already null in the source (pre-mortem #4). Inject `localStorage` + ack + FS. (~280 lines) — Closes G6, G7, G8, G11.
7. **Test-first — migration backup/delete ordering + idempotency + nested sessions.** `__tests__/migration-backup.test.ts` (order: backup→corpus→ack→delete; no delete before ack; ack-never-resolves → no delete), `migration-idempotency.test.ts` (run-twice no-op; half-complete recovery; `state/`-only corpus; corrupt source → backup-still-taken not silent-empty), `migration-sessions.test.ts` (per-node scopes/runs from both sources fold without loss; evidence at chosen scope). Commit `test:`. (~420 lines) — Closes G6-G11, G16, G17.
8. **Commit-on-write at application boundaries.** Wire `CorpusGit.commit()` at session-switch / generate / explicit-save / migration-complete (arch-review F4, pre-mortem #2): ONE batched commit for migration; logical-boundary commits steady-state; never per-write/per-setState. `CorpusGit` injected, not global. (~120 lines) — Closes G12.
9. **Test-first — commit-on-write boundary + log pagination.** `__tests__/commitOnWrite.test.ts` over real iso-git + in-memory `CorpusFS` (the `gitCore.test.ts` pattern): one commit per boundary; ten setStates coalesce; `git.log({filepath,depth})` paginates. Commit `test:`. (~160 lines) — Closes G12.
10. **Flag-OFF regression + SSR safety.** `__tests__/workspaceStore-corpus-s4-flag.test.ts`: flag OFF → localStorage adapter, migration never entered, corpus never called (spy), S1 characterization re-passes; SSR → no `window`/OPFS touch at module load, defaults render. (~180 lines) — Closes G13, G14.
11. **Real-OPFS migration smoke (out-of-CI, pre-merge).** New `docs/spikes/corpus-migration-smoke.md`: seed localStorage in Chromium/Firefox, flip flag, observe backup→corpus→ack→delete, a `git log` migration commit, `quota-exceeded` aborts non-destructively. Not CI. (~70 lines doc) — documents real-env half of G3,G4,G6,G8,G12.
12. **Docs.** Update `meta-formalism-copilot/CLAUDE.md` (corpus entry: S4 folder-layout/migration/commit-on-write; flag now has migration but guard still on), `docs/thoughts/corpus-fs-seam.md` (S4 section), and the folder-layout contract doc (arch-review F5). Note for the implementer: `migration.ts`/`folderLayout.ts` avoid reserved Next.js names (`layout.ts`/`page.ts`/`route.ts`/`template`/`default`/`loading`/`error`/`not-found`). (small)

## Implementation order

`1 → 2 → 3 → [4, 5] → [6, 7] → [8, 9] → 10 → 12`, with **11 runnable any time after 8** and **12 last**. The flag-production-guard flip is NOT in this branch — it is a follow-up commit gated on step 11's smoke (pre-mortem #5).

Reading: the folder-layout reader/writer (1,2) is foundational — both session-switch and migration write through it. The ack abstraction (3) is needed by migration's delete gate (6) and commit boundaries (8). Session-switch (4,5) and migration (6,7) both depend on 1-3 and are independent of each other. Commit-on-write (8,9) depends on the boundaries existing (4,6). Regression/SSR (10) last before docs.

## Size estimate

All new files under 500 lines (largest: migration.ts ~280, folderLayout ~220+reader). Edits to existing files: `storeAdapter.ts` (+60, step 3), the page.tsx call site (sibling path selection, ~40 — keep the bridge for OFF), small `workspaceStore` touch. Net new: ~2300 lines, ~55% tests.

## Estimated context cost

Research ~38k (complete), Implementation ~75k, Review/verify ~28k.

## Actual context cost (post-implementation)

_(placeholder — fill after implementation)_

## Test specification

Folded from `docs/working/test-strategy-corpus-s4.md` (gaps G1-G17). Each row maps a recommended test to gaps + a diagnostic expectation.

| Test case | Expected behavior | Level | Diagnostic expectation | Closes gaps |
|---|---|---|---|---|
| Bug-fix characterization (session switch + back) | 3-version artifact keeps 3 versions + index; 2 custom types (def+content) intact; no cross-session bleed; negative control through old bridge shows the loss | characterization/integration | print deep-diff of A before/after; print B's custom-type set | G1, G2, G5 |
| Folder-layout writer/reader round-trip | full `WorkspaceState` → files → deep-equal; 20-version artifact; transient sanitized; custom def+content paired | contract/unit | print path + expected/actual bytes on mismatch | G3, G4, G15 |
| Migration backup-before-delete ordering | order backup→corpus→ack→delete; no `removeItem` before ack; ack-never → no delete, backup intact | integration | print call sequence; assert spy order | G6, G7, G8 |
| Migration idempotency / half-complete / `state/` / corrupt | run-twice no-op; partial recovers w/o dup folders; `state/`-only folds; corrupt source → backup-taken not silent-empty | integration | print marker state + folder count | G9, G11, G16 |
| Migration nested sessions + evidence | every (scope, runNumber)+artifacts preserved from both sources; evidence at chosen scope, not per-session-dup | integration | print scope/run inventory before/after | G10, G17 |
| Commit-on-write boundary + log pagination | one commit per boundary; ten setStates coalesce; `git.log({depth})` paginates | integration (real iso-git) | print commit count + oids + page size | G12 |
| Flag-OFF regression + SSR | OFF → localStorage, migration never entered, corpus never called; S1 characterization passes; SSR no `window` touch | integration | spy call counts; no-throw on no-`window` | G13, G14 |
| Real-OPFS migration smoke (out-of-CI) | real Chromium/FF: backup→corpus→ack→delete; migration commit in `git log`; quota aborts non-destructively | e2e (manual) | checklist prints per-step result | G3,G4,G6,G8,G12 (real-env) |

## Failure modes considered

**Gate decisions (both Round-1 triggers evaluated independently):**
- **`/pre-mortem`: FIRED** — S4 is the one sub-task with an irreversible step (deleting localStorage) AND it is the real bug fix (a data migration + behavior change). Self-applied; output at `docs/reviews/pre-mortem-s4.md`. Five narratives produced; **mitigations folded into the plan:** #1 (delete-before-safe) → §Approach injected `awaitDurable` ack + localStorage backup, steps 3/6; #2 (commit storm) → §Approach single batched migration commit + boundary commits, steps 8/9; #3 (half-migration) → §Approach resumable + per-workspace idempotent, steps 6/7; #4 (custom-type content already-gone) → §Approach live-zustand-authoritative + null-content log, step 6; #5 (production flag flip) → §Approach guard stays in this commit, flip is a follow-up gated on step 11. Three are must-address (#1, #3, #5), all mitigated in-plan.
- **`/architecture-review`: FIRED** — the plan changes module structure (new folder-layout + migration modules), public surface (session-switch + migration entry replacing page.tsx callbacks), data model (folder layout becomes the persisted contract), and cross-cutting concerns (storage-seam selection, commit-on-write, migration composition root) — three of four trigger categories. Self-applied; output at `docs/reviews/architecture-review-s4.md`. **Findings folded in:** F1 (session-switch is a data op, wholesale reset) → §Approach + step 4; F2 (migration in its own module) → step 6; F3 (inject the ack source) → step 3; F4 (commit at the boundary, not the write) → step 8; F5 (folder layout is a consumer contract — version+fail-loud) → steps 1/12; F6 (don't mutate the OFF `WorkspaceSnapshotFns` contract) → step 4. F1 is the single most important structural concern (do not backslide into "wire store snapshot into the hooks").

| Failure mode | Guard |
|---|---|
| localStorage deleted before bytes are durable → total data loss (pre-mortem #1) | Delete gates on injected `awaitDurable()` (truthful ack), not bare OPFS resolve; backup written to localStorage (survives OPFS eviction); test G8 |
| Migration commit storm freezes the tab (pre-mortem #2) | ONE batched migration commit; steady-state commits on logical boundaries only, never per-write/setState (arch-review F4); test G12 |
| Half-migration leaves duplicate/confused workspaces (pre-mortem #3) | Resumable + per-workspace idempotent; localStorage authoritative until full ack; test G9 |
| Custom-type content "lost" by migration (was already gone in old blobs) (pre-mortem #4) | Live zustand authoritative for active session; migrate blobs as-is + log pre-null custom types so blame is attributable; test G2/G10 |
| Flag enabled in production before real-OPFS migration is proven (pre-mortem #5) | `flag.ts` production guard STAYS in this commit; flip is a follow-up gated on step 11 smoke |
| Session-switch reintroduces the bug via partial-merge / blob copy (arch-review F1) | Corpus path REPLACES store custom-type/artifact state wholesale from the folder; never a partial `setState`; bug-fix characterization G1/G2/G5 |
| Migration couples the store/hooks to `CorpusFS` (arch-review F2) | Migration is its own module, composition-root-triggered, `localStorage`+ack+FS injected |
| Malformed source localStorage parsed as empty then deleted (test G16) | Migration takes the backup first; a corrupt source is surfaced (typed/flagged), never silent-empty-then-delete |
| SSR break — corpus read during render (research invariant) | Migration + folder read only in effects/handlers; SSR renders defaults; test G14 |
| Reserved Next.js filename collision | `migration.ts`/`folderLayout.ts` (not page/route/layout/etc.); noted for implementer in step 12 |

## Risks

- **The in-memory `CorpusFS` fake vs real OPFS durability/ack timing** — the residual risk class of the whole initiative. The delete gate's `awaitDurable()` is only as truthful as the real-OPFS flush probe, which CI cannot exercise. Mitigated (not eliminated) by the localStorage backup + the out-of-CI migration smoke (step 11). Primary residual risk.
- **No staging tier** — single-tenant Vercel deploys mean the first real-OPFS migration IS a real user's only copy (pre-mortem #5). The production guard + smoke gate are the compensating controls.
- **Pre-existing data loss is not recoverable** — content the OLD bridge already dropped (custom-type content in session blobs) cannot be restored by S4; only the live active session is fully intact (pre-mortem #4). Documented, not fixable.
- **`git.log` cliff if commit-on-write over-commits** — carried from S3; mitigated by boundary-only commits + paginated log (test G12; perf-characteristics revisit triggers stay live).
- **Evidence store scope is an unresolved product decision** (see open questions) — defaulting to corpus-global; if it should be per-workspace, step 6 + test G17 change.

## Rollback

S4 has one irreversible component (deleting localStorage after backup). Be honest about it.

**Pre-ship / code rollback (no user ran migration):** `git revert <s4-merge-sha>` removes the new modules + the storeAdapter/page.tsx edits atomically. Because the flag is default-off AND production-guarded (the guard is NOT flipped in this branch), no production data path used the corpus; revert has no data-state consequence.

**A user ran migration (flag on in dev, or post-guard-flip):**
- **Backup location/format:** a single localStorage key `corpus-migration-backup-v1` holding `{ "workspace-zustand-v1": <raw>, "workspace-sessions-v1": <raw>, "metaformalism-sessions": <raw>, "evidence-store-v1": <raw>, "workspace-v2": <raw>, "migratedAt": <iso> }`. Written to localStorage (NOT OPFS) so it survives an OPFS eviction.
- **Restore procedure:** a `restoreFromBackup()` path (and a documented manual console snippet) reads `corpus-migration-backup-v1`, writes each captured key back to its original localStorage key, removes the done-marker, and clears the corpus `state/`+`workspaces/` (so the next load takes the localStorage path again). Restore is idempotent and safe to run repeatedly.
- **Half-completed migration recovery:** because localStorage is authoritative until the FULL migration acks (delete gated on `awaitDurable()`), a crash before the ack leaves localStorage intact — next load detects the absent done-marker, discards the partial corpus write, and resumes (or the user runs restore). A crash AFTER delete but BEFORE backup removal still has the backup → restore recovers. The only unrecoverable window is OPFS-evicted-AND-localStorage-already-deleted, which the localStorage-backup + ack-gate are designed to make unreachable (pre-mortem #1 mitigation).
- **No remote/service to restart**; the dev `.git/` in OPFS is cleared by site-data clear.

## Open questions for plan review (user decides)

1. **Evidence store scope** (test G17): migrate `evidence-store-v1` as a corpus-global file (default, matches current global semantics) or per-workspace? Per-workspace would re-scope existing global evidence and needs a mapping rule.
2. **`state/` blob reconciliation path** (test G11): migrate localStorage → folder layout directly (bypass the blob, simplest) or localStorage → blob → folder (reuses S1's blob writer)? Plan assumes direct + retire `state/`.
3. **Raw source bytes**: confirm S4 keeps extracted-text-only (today's behavior, plan default) and defers `sources/<id>.<ext>` byte storage to a later sub-task.
4. **When to flip the `flag.ts` production guard** (pre-mortem #5): confirm it is a separate follow-up gated on the real-OPFS migration smoke (step 11), not part of the S4 implementation commit.
