# Checkpoint: corpus-s4 (DD-009 sub-task S4 — the keystone)
Date: 2026-06-01
Branch: feat/corpus-s4-migration (off integration/6.1 / S1+S2+S3)
Research: docs/working/research-corpus-s4.md
Plan: docs/working/plan-corpus-s4.md
Decomposition: docs/working/decomposition-corpus-architecture.md
Test strategy: docs/working/test-strategy-corpus-s4.md
Pre-mortem: docs/reviews/pre-mortem-s4.md
Architecture review: docs/reviews/architecture-review-s4.md

## Project state
- **Branch purpose**: replace the lossy `app/page.tsx` session-snapshot bridge with folder/ref-based session switching over the corpus folder layout, AND run a one-shot backup-before-delete migration folding the five localStorage stores into the corpus — so the original DD-009 trigger bug becomes STRUCTURALLY IMPOSSIBLE.
- **Position in larger initiative**: the keystone (the bug fix) of six sub-tasks (S0–S5); depends on S0 layout + S1 adapter, integrates S2 (mirror ack) + S3 (`CorpusGit.commit()`); blocks only S5's status UI.
- **Status**: plan drafted + gated; **awaiting user approval at the RPI firm gate before implementation** (data migration → non-negotiable gate). NO app/ code written.

## Key findings (curated from research)
- **The bug is two distinct losses in the page.tsx bridge.** `getWorkspaceSnapshot` (page.tsx:124-143) omits `customArtifactTypes`/`customArtifactData` AND flattens `versions[]` via `getArtifactContent` (current-version-only). `resetWorkspaceToSnapshot` (page.tsx:145-173) rebuilds single-version records and `setState`s a field set omitting custom types → partial-merge leaves prior custom-type DEFS in place (bleed) while CONTENT is dropped. [observed]
- **The store's own `getSnapshot`/`resetToSnapshot` (workspaceStore.ts:472-491) DO include custom types + full artifacts — but are NOT wired into the session hooks.** "Just call them" is the TEMPTING WRONG TURN (arch-review F1): it fixes the symptom but keeps the blob model DD-009 rejected. S4 must make session-switch a DATA op (load a folder), not a better blob copy. [observed]
- **Five localStorage stores to fold**: `workspace-zustand-v1` (main store), `workspace-sessions-v1` (session index + flattened blobs), `metaformalism-sessions` (per-scope runs, ALSO nested in each `WorkspaceSession.formalizationSessions`), `evidence-store-v1` (global, bridge never touched it), legacy `workspace-v2` (read-only migration source). [observed]
- **`migrateFromV2` (workspaceStore.ts:251-285) is the one-shot pattern to follow** — and it carries custom types correctly (lines 280-281), so the v2→corpus folding is lossless reference. `migrateV1Workspace` (workspacePersistence.ts:10-31) is the delete-old-only-after-new-written pattern. [observed]
- **The S1 `state/` blob is a SECOND workspace copy** (`stateBlobPath`, paths.ts:83). S4 reconciles it into the folder layout + retires `state/`. [observed]
- **`CorpusGit.commit()` exists but is NOT wired** — commit-on-write is S4's, at LOGICAL save boundaries, never per-write (arch-review F4; prevents the migration commit storm, pre-mortem #2). [observed — seam doc §S3]
- **`flag.ts` production guard (flag.ts:21) stays in this branch** — its comment says remove "only when S4 ships migration"; the plan defers the flip to a follow-up gated on the real-OPFS smoke (pre-mortem #5). [observed]
- **OPFS write-resolve ≠ durable.** The localStorage delete MUST gate on a truthful ack (mirror status / git commit), not the bare OPFS write; backup goes to localStorage (survives OPFS eviction). This is THE safety interlock (pre-mortem #1). [observed]

## Plan (summary — full steps in plan-corpus-s4.md)
1. `folderLayout.ts` writer — `WorkspaceState` → manifest + `v####.md` per version + `meta.json` + custom-types + decomposition; transient sanitization.
2. (test-first) reader half + `folderLayout.test.ts` round-trip.
3. `storeAdapter.ts` — injected `awaitDurable()` ack abstraction resolved by mode (arch-review F3).
4. Folder/ref session-switch (corpus path) — wholesale store replace; sibling to OFF-path hooks (arch-review F1/F6).
5. (test-first) `sessionSwitch-bugfix.test.ts` — the bug-fix characterization + old-bridge negative control.
6. `migration.ts` — read 5 stores → backup to localStorage → write corpus → `awaitDurable()` → delete → done-marker → remove backup; reconcile `state/`; log pre-null custom types (arch-review F2; pre-mortem #1/#3/#4).
7. (test-first) `migration-backup.test.ts` + `migration-idempotency.test.ts` + `migration-sessions.test.ts`.
8. Commit-on-write at app boundaries — one batched migration commit; boundary commits steady-state (arch-review F4; pre-mortem #2).
9. (test-first) `commitOnWrite.test.ts` (real iso-git + in-memory FS).
10. (test-first) `workspaceStore-corpus-s4-flag.test.ts` — flag-OFF regression + SSR safety.
11. Out-of-CI `docs/spikes/corpus-migration-smoke.md` (real OPFS backup→corpus→ack→delete; quota non-destructive).
12. Docs (CLAUDE.md + corpus-fs-seam.md S4 + folder-layout contract).

Implementation order: `1 → 2 → 3 → [4,5] → [6,7] → [8,9] → 10 → 12`; 11 any time after 8. Production-guard flip is a SEPARATE follow-up gated on step 11.

## Invariants (filtered to S4's steps)
- Session-switch REPLACES store custom-type/artifact state wholesale from the folder — never a partial `setState` (the bleed mechanism). (arch-review F1)
- localStorage OFF path stays byte-for-byte until migration runs; corpus path is a sibling selected by `isCorpusEnabled()`; don't mutate `WorkspaceSnapshotFns`. (arch-review F6)
- Delete gates on injected `awaitDurable()` (truthful ack), not bare OPFS resolve; backup to localStorage. (pre-mortem #1)
- Migration resumable + per-workspace idempotent; localStorage authoritative until full ack. (pre-mortem #3)
- ONE batched migration commit; steady-state commits on logical boundaries only; storage seam stays git-unaware. (arch-review F4, pre-mortem #2)
- Transient sanitization (`sanitizeVerificationStatus`/`sanitizeNodeStatus`) on the corpus write path.
- SSR: migration + folder read only in effects/handlers, never at render/module load.
- No reserved Next.js filenames (`migration.ts`/`folderLayout.ts`, not page/route/layout/etc.).
- Production guard in `flag.ts` STAYS in this commit. (pre-mortem #5)

## File map
- `app/lib/corpus/folderLayout.ts` — writer+reader over CorpusFS (steps 1,2, new)
- `app/lib/corpus/migration.ts` — one-shot backup-before-delete migration (step 6, new)
- `app/lib/corpus/storeAdapter.ts` — `awaitDurable()` ack abstraction + resolution (step 3, edit)
- `app/page.tsx` — corpus session-switch sibling path at the call site; keep bridge for OFF (step 4, edit)
- session-switch wiring (new fn; may live in a new hook or in corpus/, NOT in the OFF hooks) (step 4, new)
- commit-on-write wiring at generate/edit/switch handlers (step 8, edit)
- `app/lib/corpus/__tests__/folderLayout.test.ts` (step 2, new test)
- `app/lib/corpus/__tests__/sessionSwitch-bugfix.test.ts` (step 5, new test — THE bug-fix proof)
- `app/lib/corpus/__tests__/migration-backup.test.ts` (step 7, new test)
- `app/lib/corpus/__tests__/migration-idempotency.test.ts` (step 7, new test)
- `app/lib/corpus/__tests__/migration-sessions.test.ts` (step 7, new test)
- `app/lib/corpus/__tests__/commitOnWrite.test.ts` (step 9, new test — real iso-git)
- `app/lib/stores/__tests__/workspaceStore-corpus-s4-flag.test.ts` (step 10, new test)
- `docs/spikes/corpus-migration-smoke.md` (step 11, new — out-of-CI gate)
- `meta-formalism-copilot/CLAUDE.md` (step 12, edit)
- `docs/thoughts/corpus-fs-seam.md` — S4 seam section (step 12, edit)
- folder-layout contract doc (step 12, new/edit — arch-review F5)

(18 entries — within the 20-entry checkpoint budget; no decomposition warning.)

## Open questions (for user at the firm gate)
- **Evidence store scope**: migrate `evidence-store-v1` corpus-global (plan default) or per-workspace? (test G17)
- **`state/` reconciliation**: localStorage→folder direct (plan default, retire `state/`) or localStorage→blob→folder? (test G11)
- **Raw source bytes**: confirm S4 keeps extracted-text-only and defers `sources/<id>.<ext>` byte storage.
- **Production-guard flip timing**: confirm it is a follow-up gated on step 11's real-OPFS smoke, not part of S4. (pre-mortem #5)
