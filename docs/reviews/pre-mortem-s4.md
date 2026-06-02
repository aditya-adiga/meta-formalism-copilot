# Pre-Mortem: DD-009 corpus S4 — migration + session-model rewrite

**Proposal:** docs/working/plan-corpus-s4.md (the localStorage→corpus one-shot migration + folder/ref-based session switch replacing app/page.tsx:124-178)
**Date:** 2026-06-01
**Upstream what-if analysis:** none

> ℹ️ **No upstream what-if analysis provided.** Failure narratives are generated directly from the proposal. For higher-quality narratives, run `what-if-analysis` first and provide its output.

**Prior-art scan:** `grep -ril migration|backup|rollback|"data loss"|delete docs/decisions/ docs/working/` surfaced DD-009 §Consequences (backup-before-delete mandate, single-shot conversion) and the DD-009-level `/pre-mortem` in `docs/spikes/isomorphic-git-perf-50mb.md` §Failure narratives (5 narratives: browser-perf cliff, 3000-version `git.log` cliff, OPFS quota swallowed, mirror-ack misleading "saved", iso-git CVE). The narratives below are S4-SPECIFIC (the migration + session rewrite) and do not re-tell those; #2 below connects to the DD-009 3000-version narrative and is tagged accordingly.

This is the keystone sub-task and the only one with an irreversible step (deleting localStorage). The pre-mortem is mandatory here.

---

## Failure Narratives

### 1. The delete fired before the bytes were safe

**Root cause:** the migration deleted the five localStorage keys gated on the bare OPFS `writeFile` resolve, not on a truthful mirror/commit ack. OPFS/IndexedDB "write completed" means the transaction committed in memory, not that bytes were fsynced (research-corpus-architecture.md §Gotchas; seam doc §Load-bearing facts).
**Chain of consequences:** migration runs on first flag-on → corpus folder written to OPFS → `removeItem` called on `workspace-zustand-v1`, `workspace-sessions-v1`, `metaformalism-sessions`, `evidence-store-v1`, `workspace-v2` → user closes the laptop lid before the OPFS transaction flushed → on next open OPFS is empty (browser evicted the un-flushed transaction under memory pressure) → corpus read returns nothing → workspace appears blank.
**Observable outcome:** user opens the app to an empty workspace; the backup (if written to OPFS too) is also gone; all sessions, all artifact versions, all custom types vanished. A support report: "I turned on the new storage option and lost everything."
**Plausibility:** Plausible (10–50%) — depends entirely on whether the delete gates on a real ack.
**Severity:** Catastrophic (irreversible, all user work).
**Mitigation:** in plan §Steps (migration delete step) gate `localStorage.removeItem` on a TRUTHFUL ack — `mirrorFs.getMirrorStatus().state === "ok"` when a folder is connected, or a successful `CorpusGit.commit()` returning a real oid — never the bare `CorpusFS.writeFile` resolve; AND write the backup to localStorage itself (a separate key, not OPFS) so it survives an OPFS eviction; tested by test-strategy G8 (delete-only-after-ack) + G7 (backup location).

### 2. The migration commit storm froze the tab

**Root cause:** commit-on-write was wired to fire on every store `setState`, and migration replays the entire history (every artifact version of every session) as individual writes, so migration generated thousands of git commits in a tight loop on the main thread before the worker drained.
**Chain of consequences:** migration converts N sessions × M artifacts × up-to-20 versions into folder files → each write triggers a `CorpusGit.commit()` → the iso-git worker queue backs up → SHA1/zlib CPU bursts (even off-main-thread, the postMessage round-trips serialize) → main thread blocks on the awaited acks → tab shows a spinner for 40+ seconds → user force-quits mid-migration → half-migrated state.
**Observable outcome:** beachball/"page unresponsive" dialog during migration; if force-quit, a half-completed corpus (next-load recovery path is now load-bearing). Power users with deep histories hit this hardest.
**Plausibility:** Plausible (10–50%). **Severity:** High (recoverable but ugly; risks the half-complete state of narrative #3). `[PRIOR CONSIDERATION: docs/spikes/isomorphic-git-perf-50mb.md §Failure narratives #2 — the 3000-version git.log cliff is the read-side twin; this is the write-side.]`
**Mitigation:** in plan §Steps (commit-on-write) make migration a SINGLE batched commit (write all folder files, then ONE `CorpusGit.commit("migrate from localStorage")`), and make steady-state commit-on-write fire on logical save boundaries (session switch, generate, explicit save), never per-keystroke/per-setState; tested by test-strategy G12 (one commit per boundary; ten setStates coalesce).

### 3. The half-migrated workspace that recovery couldn't read

**Root cause:** migration crashed (tab closed, OOM, the commit storm of #2) after writing some workspace folders but before writing the done-marker and before deleting localStorage; the next-load recovery path assumed an all-or-nothing migration and re-ran from scratch, writing a SECOND copy of the already-migrated workspaces with new slugs.
**Chain of consequences:** partial corpus on disk + intact localStorage (delete hadn't run — good) → next load sees flag on, marker absent → re-runs migration → `workspaceSlug` collision handling appends a suffix → two folders per workspace → manifest/settings now list duplicates → session switcher shows every workspace twice → user picks one, edits, picks the other, sees stale data.
**Observable outcome:** duplicated sessions in the switcher; edits land in one copy, reads come from another; "my changes keep disappearing." Not data LOSS (localStorage was intact) but data CONFUSION that erodes trust.
**Plausibility:** Plausible (10–50%). **Severity:** Medium (recoverable: localStorage backup intact, but confusing and support-heavy).
**Mitigation:** in plan §Steps (done-marker / idempotency) make migration RESUMABLE not restart-from-scratch — per-workspace done-markers (or a content hash) so a re-entered migration skips already-written workspaces; and keep localStorage as the source of truth until the FULL migration acks, so a partial state always restores cleanly from localStorage; tested by test-strategy G9 (half-complete detection, no duplicate folders).

### 4. The custom types came back wrong (the bug we shipped to fix, re-shipped)

**Root cause:** the new folder-layout migration wrote custom-type DEFINITIONS to `custom-types/<id>.json` but the migration mapping for custom-type CONTENT (`customArtifactData`, keyed `custom-<id>`) missed an id whose key had been mangled by an old session-bridge round-trip, so a definition migrated without its content (or vice versa) — exactly the definition/content split DD-009 set out to make impossible.
**Chain of consequences:** legacy `workspace-sessions-v1` blobs were produced by the OLD lossy bridge, which already dropped `customArtifactData` → migration faithfully migrates the lossy blob → some sessions get custom-type defs with `null` content → user opens a migrated session, sees their custom artifact type listed but empty → assumes the migration ate their work (it was already gone, pre-migration, but the user can't tell).
**Observable outcome:** migrated sessions show custom artifact types present but with blank/regeneratable content; user reports "the migration deleted my custom artifact outputs." The damage predates S4 but S4 is blamed.
**Plausibility:** Likely (>50%) for any user who used custom types AND switched sessions before S4 — their content is ALREADY gone in the localStorage blobs.
**Severity:** Medium (the data is genuinely gone, but it was gone before S4; the new model prevents recurrence going forward).
**Mitigation:** in plan §Approach state explicitly that migration cannot RECOVER content the old bridge already dropped; migrate the live `workspace-zustand-v1` (which DOES hold current custom-type content) as authoritative for the ACTIVE session, and migrate session blobs as-is with a one-time note; tested by test-strategy G2 (custom types preserved going forward) + G10 (nested-session fold). Add a migration log entry naming any custom type whose content was already null in the source blob so support can distinguish "S4 ate it" from "the old bug ate it."

### 5. The flag flipped in production and there was no migration there to flip it safely

**Root cause:** S4 removes the `NODE_ENV==="production"` guard in `flag.ts:21` (its comment says remove it "only when S4 ships migration"), but the migration was only ever exercised against the in-memory `CorpusFS` fake (jsdom) and the dev OPFS — the real production OPFS quota/eviction behavior differed, and the un-guarded flag let an end user (single-tenant Vercel deploy) enable it.
**Chain of consequences:** S4 merges, production guard removed → a self-hosting researcher reads the changelog, sets `localStorage.setItem("corpus-fs-enabled","1")` in their deployed instance → migration runs against a real browser with a near-full OPFS quota → `quota-exceeded` mid-migration → partial corpus → if the delete gate is even slightly wrong (#1), data loss in a real user's only copy.
**Observable outcome:** a self-hoster files an issue: "enabled the corpus flag per the release notes, lost my workspace." No staging tier exists (single-tenant by design) so the first real-OPFS migration IS production.
**Plausibility:** Plausible (10–50%). **Severity:** High (real user, real data, no shared instance to catch it first).
**Mitigation:** in plan §Rollback + §Steps keep the production guard until the out-of-CI real-OPFS migration smoke (`docs/spikes/corpus-migration-smoke.md`, test-strategy "Real-substrate migration smoke") has passed in Chromium+Firefox AND the migration surfaces `quota-exceeded` as a typed, non-destructive abort (backup intact, localStorage intact, corpus partial-write discarded); flip the guard in a SEPARATE follow-up commit gated on the smoke, not in the S4 implementation commit. Revisit trigger: if any self-hoster issue reports data loss after enabling the flag, re-instate the guard immediately.

---

## Recommendations

**Must address before proceeding:**
- **#1 (delete-before-safe):** delete gates on a truthful ack, backup to localStorage (survives OPFS eviction). This is the single most important mitigation in the whole sub-task — it is the only irreversible action.
- **#3 (half-migration recovery):** migration is resumable + per-workspace idempotent; localStorage stays authoritative until the full migration acks.
- **#5 (production flag flip):** keep the `flag.ts` production guard in the S4 implementation commit; flip it only in a follow-up gated on the real-OPFS smoke.

**Worth mitigating:**
- **#2 (commit storm):** single batched migration commit + logical-boundary steady-state commits. Tracking item with a CI assertion (G12).
- **#4 (custom-type content already-gone):** migration log naming pre-null custom types so blame is attributable; document that already-dropped content is unrecoverable.

**Acknowledged risks:**
- The gap between the in-memory `CorpusFS` fake and real OPFS durability/ack timing is carried (it is the residual risk class of S1/S2/S3 too), bounded by the out-of-CI migration smoke. The team accepts that CI cannot prove real-OPFS durability; the smoke + the localStorage-backup safety net is the compensating control.
