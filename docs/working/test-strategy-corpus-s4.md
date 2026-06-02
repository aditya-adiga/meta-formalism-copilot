# Test Strategy: DD-009 corpus S4 — migration + session-model rewrite

**Scope:** the S4 implementation — a corpus folder-layout reader/writer over `CorpusFS`, the folder/ref-based session switch replacing `app/page.tsx:124-178`, the one-shot localStorage→corpus migration (backup-before-delete folding the 5 stores), and commit-on-write wiring of `CorpusGit.commit()`.
**Reviewed:** 2026-06-01

This is the test plan for code that does not exist yet (RPI plan phase). Gaps are enumerated against the *current* code S4 will replace (page.tsx bridge, the 5 stores) and against the *planned* new modules, with line refs into the current code where the change lands.

## Test Conventions

- **Vitest 4 + jsdom + React Testing Library.** Tests colocated in `__tests__/` with `.test.ts(x)` suffix (e.g. `app/lib/corpus/__tests__/`, `app/lib/stores/__tests__/`). Node APIs are available in tests (vitest runs on Node).
- **jsdom has NO OPFS / FSA / Worker / network.** Corpus adapters are tested via the in-memory `CorpusFS` fake (`app/lib/corpus/__tests__/` fake) and the shared contract suite (`corpusFsContract.ts` / `defineCorpusFsContract`); real OPFS/FSA/worker/remote are out-of-CI Playwright smokes (`docs/spikes/corpus-*-smoke.md`). S4 inherits this split: migration + folder-layout + session switch are CI-tested over the in-memory fake; the real-substrate round-trip is a smoke.
- **Real iso-git IS CI-testable** over an in-memory `CorpusFS` (vitest on Node) — `gitCore.test.ts` already does this. Commit-on-write CI tests follow that pattern.
- Characterization pattern already exists: `workspaceStore-characterization.test.ts` (S1) locks the localStorage round-trip; S4 adds the bug-fix characterization beside it.

## Untested Paths Touched by the Change

Enumerated against the current bridge + stores (the code S4 deletes/replaces) and the new module surfaces the plan introduces.

- **G1** — `app/page.tsx:137-141` — `getWorkspaceSnapshot` flattens `versions[]` to current-version-only via `getArtifactContent`; no test proves a multi-version artifact survives a session switch — not covered (this is half the bug).
- **G2** — `app/page.tsx:124-143` + `145-173` — `getWorkspaceSnapshot`/`resetWorkspaceToSnapshot` omit `customArtifactTypes`/`customArtifactData`; no test proves custom types survive a switch, nor that they DON'T bleed into a new/sibling session — not covered (the other half of the bug; both the drop AND the partial-merge bleed).
- **G3** — new folder-layout writer (`workspace.json` manifest + `artifacts/<type>/v####.md` per version + `custom-types/<id>.json` + `meta.json`) — round-trip of a full `WorkspaceState` to files and back — not covered (new code).
- **G4** — new folder-layout reader — reading a workspace folder back into `WorkspaceState` with `versions[]` and `currentVersionIndex` intact — not covered (new code).
- **G5** — new session-switch-via-folder — switching the active workspace ref loads a different folder; `customArtifactTypes`/`customArtifactData` and `artifacts` come from the TARGET folder, never the prior in-memory state (no partial-merge bleed possible) — not covered (new code; the structural fix).
- **G6** — new migration: read all 5 localStorage keys (`workspace-zustand-v1`, `workspace-sessions-v1`, `metaformalism-sessions`, `evidence-store-v1`, legacy `workspace-v2`) and fold into the corpus — not covered (new code).
- **G7** — new migration backup step — backup is written BEFORE any localStorage key is deleted; the backup is complete + restorable — not covered (DD-009 §Consequences mandate; new code).
- **G8** — new migration delete step — localStorage keys are deleted ONLY after the corpus write is acked (not on bare OPFS resolve) AND the backup exists — not covered (new code; the irreversible step).
- **G9** — new migration done-marker / idempotency — migration runs once; a second load with the marker present does NOT re-migrate or re-delete; a half-completed migration (marker absent, corpus partially written) is detected and resumed/restored — not covered (new code).
- **G10** — new migration of nested formalization sessions — per-node `FormalizationSession` scopes/runs from BOTH `metaformalism-sessions` AND each `WorkspaceSession.formalizationSessions` fold in without dropping a scope or run — not covered (new code; user-flagged per-node history risk).
- **G11** — new `state/` blob reconciliation — the S1 blob (`stateBlobPath`, paths.ts:83) is reconciled into the folder layout and `state/` retired; a corpus that has only the blob (flag was on pre-S4) migrates correctly — not covered (new code).
- **G12** — new commit-on-write — `CorpusGit.commit()` fires on a logical save boundary (not per keystroke); a session switch produces a commit; `git.log` for an artifact paginates — not covered (new code; perf-sensitive).
- **G13** — flag-OFF regression — with the flag off, persistence stays byte-for-byte localStorage; migration never runs; the page.tsx replacement still drives the localStorage session path OR the OFF path is preserved unchanged — not covered for the NEW code (S1 characterization covers the old).
- **G14** — SSR safety of the new path — the migration + folder read do not touch `window`/OPFS during render (only in effects/handlers); server renders defaults — not covered (new code; hydration-mismatch risk).
- **G15** — transient-state sanitization on the corpus write path — `verificationStatus:"verifying"`→`"none"` and node `"in-progress"`→`"unverified"` still applied before a corpus write — not covered (new code; invariant carried from workspaceStore.ts:520,523).
- **G16** — migration of a corrupt/partial localStorage source — a malformed `workspace-zustand-v1` or a `workspace-sessions-v1` with a flattened blob migrates without throwing-and-deleting (backup still taken; corrupt source surfaced, not silently emptied) — not covered (new code; data-loss-adjacent).
- **G17** — evidence store migration — `evidence-store-v1` slots fold into the corpus at the decided scope without loss and without being wrongly per-session-scoped — not covered (new code; the store the bridge never touched).

## Recommended Tests

#### Characterization: the bug is FIXED through the corpus path
**Closes gaps:** G1, G2, G5
**Type:** characterization / integration
**Priority:** high
**File:** `app/lib/corpus/__tests__/sessionSwitch-bugfix.test.ts`
**What it verifies:** a session switch that PREVIOUSLY dropped custom types and flattened versions now preserves them through the corpus folder/ref path.
**Key cases:**
- Build session A with a 3-version `causal-graph` artifact (`currentVersionIndex=1`) and 2 custom types (defs + content). Switch to a NEW session B, then switch BACK to A. Assert: A's `causal-graph` still has 3 versions and `currentVersionIndex=1`; A's 2 custom types (defs AND content) intact.
- Assert B never saw A's custom types (no partial-merge bleed): create B, add custom type X, switch to A, switch to B — B has only X, A has only its own.
- Negative control: a test that runs the SAME scenario through the OLD bridge (`getWorkspaceSnapshot`/`resetWorkspaceToSnapshot`) and asserts the loss, documenting what S4 fixes (kept until the bridge is deleted, then removed with it).
**Setup needed:** in-memory `CorpusFS` fake; a helper to build a `WorkspaceState` with multi-version artifacts + custom types; the new folder-layout reader/writer + session-switch function.

#### Folder-layout writer/reader round-trip
**Closes gaps:** G3, G4, G15
**Type:** contract / unit
**Priority:** high
**File:** `app/lib/corpus/__tests__/folderLayout.test.ts`
**What it verifies:** a full `WorkspaceState` serializes to the DD-009 folder layout and reads back deep-equal, with `versions[]` + `currentVersionIndex` preserved and transient state sanitized.
**Key cases:**
- 20-version artifact (`MAX_VERSIONS`) → 20 `v####.md` files + `meta.json` + manifest pointer; read back: same 20 versions, same index.
- `verificationStatus:"verifying"` in source → `"none"` on disk + on read; node `"in-progress"`→`"unverified"`.
- Custom type def in `custom-types/<id>.json` and content under `artifacts/custom/<id>/`; read back keeps def+content paired.
- Empty workspace → minimal valid `workspace.json`, reads back as `DEFAULT_STATE`.
**Setup needed:** in-memory `CorpusFS` fake; `parseManifest`/`serializeManifest` from manifest.ts; the new reader/writer.

#### Migration: backup-before-delete ordering
**Closes gaps:** G6, G7, G8
**Type:** integration
**Priority:** high
**File:** `app/lib/corpus/__tests__/migration-backup.test.ts`
**What it verifies:** migration writes a complete restorable backup and writes the corpus BEFORE any localStorage key is deleted, and deletes only after a truthful ack.
**Key cases:**
- Seed all 5 localStorage keys with realistic data; run migration; assert ORDER via spies/sequence: backup write → corpus write → ack observed → localStorage delete. Assert no `removeItem` fires before the corpus-write ack.
- Backup content equals the original 5 keys (byte/JSON deep-equal) and lives at the named backup location.
- Inject an ack that never resolves (mirror `failed`) → assert localStorage is NOT deleted and the backup remains; migration reports incomplete.
**Setup needed:** a fake `localStorage` (jsdom provides one; spy on `removeItem`); in-memory `CorpusFS`; a stub ack source (mirror status / git commit) controllable by the test.

#### Migration: idempotency, done-marker, half-complete recovery
**Closes gaps:** G9, G11, G16
**Type:** integration
**Priority:** high
**File:** `app/lib/corpus/__tests__/migration-idempotency.test.ts`
**What it verifies:** migration runs once and is safe to re-enter; a half-completed migration is detected, not duplicated or silently emptied.
**Key cases:**
- Run migration twice; second run is a no-op (marker present); no double-delete, no duplicate corpus folders.
- Marker absent but corpus partially written (simulate crash after corpus write, before delete) → next load detects partial state, completes (or restores from backup) without data loss; backup still present.
- Corpus has only the S1 `state/` blob (flag was on pre-S4) → reconciles into folder layout, retires `state/`.
- Malformed `workspace-zustand-v1` → backup still taken; corrupt source surfaced (typed error / flagged), NOT parsed as empty-then-deleted.
**Setup needed:** fake `localStorage`; in-memory `CorpusFS`; ability to inject a partial corpus state and a corrupt source.

#### Migration: nested formalization sessions + evidence store
**Closes gaps:** G10, G17
**Type:** integration
**Priority:** high
**File:** `app/lib/corpus/__tests__/migration-sessions.test.ts`
**What it verifies:** per-node formalization run history (from both standalone and nested sources) and the global evidence store fold in without loss or mis-scoping.
**Key cases:**
- `metaformalism-sessions` with a global scope + 2 node scopes (3 runs total) AND a `WorkspaceSession.formalizationSessions` with an overlapping/different set → folded result preserves every distinct (scope, runNumber) and its `artifacts[]`; no run dropped, no duplicate run collision.
- `evidence-store-v1` slots → present in the corpus at the decided scope; assert NOT wrongly duplicated per workspace session (or assert the chosen scope explicitly).
**Setup needed:** fake `localStorage` seeded with multi-scope sessions + evidence; in-memory `CorpusFS`.

#### Commit-on-write boundary + log pagination
**Closes gaps:** G12
**Type:** integration (real iso-git over in-memory CorpusFS)
**Priority:** medium
**File:** `app/lib/corpus/__tests__/commitOnWrite.test.ts`
**What it verifies:** `CorpusGit.commit()` fires on logical save boundaries (not per keystroke), and history is paginated.
**Key cases:**
- A session switch / generate / edit triggers exactly one commit; ten rapid setState calls within one logical save coalesce to one commit (or the debounced count the plan specifies).
- `git.log({filepath: artifact, depth: 5})` returns ≤5 entries + a cursor; never an unbounded eager log.
**Setup needed:** real `isomorphic-git` over an in-memory `CorpusFS` (the `gitCore.test.ts` pattern); the commit-on-write trigger.

#### Flag-OFF regression + SSR safety
**Closes gaps:** G13, G14
**Type:** integration
**Priority:** high
**File:** `app/lib/stores/__tests__/workspaceStore-corpus-s4-flag.test.ts`
**What it verifies:** with the flag off, behavior is unchanged and migration never runs; the new path is SSR-safe.
**Key cases:**
- Flag OFF → `resolveWorkspaceStorage` returns the localStorage adapter; migration code path is never entered; `getDirectory`/CorpusFS never called (spy).
- Flag OFF → the existing S1 characterization still passes (re-run as regression).
- SSR: rendering/serializing on the server (no `window`) does not invoke the migration or a corpus read; defaults render. Assert no throw when `window`/`navigator.storage` are absent at module load.
**Setup needed:** flag stub; spy on the corpus selection; a no-`window` shim for the SSR assertion.

#### Real-substrate migration smoke (out-of-CI)
**Closes gaps:** G3, G4, G6, G8, G12 (real-env)
**Type:** e2e (manual)
**Priority:** medium
**File:** `docs/spikes/corpus-migration-smoke.md`
**What it verifies:** the migration + folder-layout + commit-on-write work against REAL OPFS (+ optional FSA mirror + remote) in Chromium/Firefox, including the truthful-ack gate on the localStorage delete.
**Key cases:** seed localStorage in a real browser, flip the flag, observe backup written, corpus populated, localStorage deleted only after ack, a `git log` showing the migration commit. Manual checklist, spike style.
**Setup needed:** Playwright harness shape reused from `corpus-opfs-smoke.md`; a throwaway remote for the push leg.

## What NOT to Test

- **The S1/S2/S3 modules in isolation** (`opfsAdapter`, `fsaAdapter`, `mirrorFs`, `gitCore`, `gitWorkerClient`) — already covered by their own suites + the shared contract. S4 tests them only through the migration/session/commit paths, not re-unit-tested.
- **`parseManifest`/path builders** — covered by S0/S1 tests; S4 reuses them and tests only the composed round-trip.
- **The deleted bridge's internal helpers after deletion** — once `getWorkspaceSnapshot`/`resetWorkspaceToSnapshot` are removed, their tests are removed with them (don't keep dead tests). The negative-control test is the only one that exercises the old behavior, and it goes when the bridge goes.
- **Real Worker / real remote in CI** — jsdom can't; deferred to the smoke.

## Coverage Gaps Beyond Current Scope

**1.** Multi-tab OPFS contention during migration (two tabs flip the flag simultaneously) — a real concurrency hazard the in-memory fake can't model; track for the S4 smoke / S5, not CI.
**2.** Safari/WebKit OPFS — unmeasured across the whole initiative; remains a pre-launch verification item, not an S4 CI test.
**3.** Very large workspaces (50–100MB raw sources) migrating — perf, deferred to the iso-git perf revisit triggers; only relevant if S4 adds raw-byte source storage (a scope decision).

## Summary

The single highest-value test is the **bug-fix characterization** (G1/G2/G5): it is the literal proof that S4 closed the original DD-009 trigger — a session switch that used to drop custom types and flatten versions now preserves them, AND custom types no longer bleed across sessions. Right behind it are the **backup-before-delete ordering** and **idempotency/half-complete recovery** tests, because the migration's delete step is the only irreversible action in the whole initiative. The main residual risk after this plan is the gap between the in-memory `CorpusFS` fake and real OPFS durability/ack timing — covered (not eliminated) by the out-of-CI migration smoke. Open questions the enumeration surfaced: the explicit scope of the evidence store in the corpus (G17), and whether the `state/` blob is migrated directly or via a blob→folder hop (G11) — both belong in the plan's open-questions for user decision.
