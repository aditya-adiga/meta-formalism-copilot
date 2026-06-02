# Checkpoint: corpus-s1 (DD-009 sub-task S0+S1)
Date: 2026-06-01
Branch: feat/corpus-architecture
Research: docs/working/research-corpus-architecture.md
Plan: docs/working/plan-corpus-s1.md
Decomposition: docs/working/decomposition-corpus-architecture.md
Test strategy: docs/working/test-strategy-corpus-s1.md
Architecture review: docs/reviews/architecture-review.md

## Project state
- **Branch purpose**: deliver DD-009's foundational corpus filesystem layer — a `CorpusFS` interface + OPFS adapter behind a default-off flag — without changing the localStorage production path.
- **Position in larger initiative**: first of six sub-tasks (S0–S5) from the DD-009 decomposition; blocks S2 (FSA mirror), S3 (git pipeline), S4 (migration+session rewrite). DD-009 decision + both iso-git spikes are merged into this branch.
- **Blocked on**: user approval of `plan-corpus-s1.md` (RPI step 4 gate) before any implementation.

## Key findings (curated from research)
- **The bug DD-009 targets is real and located**: workspace-session switching uses a *lossy* bridge in `app/page.tsx:124-173` (`getWorkspaceSnapshot`/`resetWorkspaceToSnapshot`) that omits `customArtifactTypes`/`customArtifactData` and flattens `ArtifactRecord.versions[]` to current-version-only. The store's *own* `getSnapshot` (workspaceStore.ts:503-521) was later fixed to include them, but sessions don't use it. **S1 does not fix this — S4 does** (replace the bridge). [observed]
- **Five fragmented localStorage stores** exist: `workspace-zustand-v1` (main), `workspace-sessions-v1`, `metaformalism-sessions`, `evidence-store-v1`, legacy `workspace-v2`. S1 touches only the main store's storage path. [observed]
- **Invariants S1 must honor**: SSR safety (no OPFS during render — guard like `skipHydration`); transient-state sanitization on persist; Vercel client-only persistence. [observed]
- **jsdom has no OPFS** — the adapter's real I/O is untestable in Vitest; CI uses an in-memory `CorpusFS` fake + a shared contract test, real OPFS via out-of-CI Playwright (mirrors the spike harness). [observed]
- **Perf is de-risked** by both spikes (proceed-to-RPI); not an S1 concern beyond honoring lazy-`git.log` later (S3). Safari/OPFS remain pre-launch verification items. [observed]
- **iso-git `buffer` polyfill is NOT an S1 concern** — nothing imports iso-git until S3. [observed]

## Plan (summary — full steps in plan-corpus-s1.md)
1. `corpus/types.ts` — `CorpusFS` interface; single substrate-neutral `CorpusErrorKind` source feeding `CorpusError`+`CorpusWorkerError`; document `CorpusGit` as a separate interface over `CorpusFS`.
2. `corpus/layout.ts` — DD-009 folder-layout path builders + slug-traversal sanitization.
3. `corpus/manifest.ts` — `workspace.json` schema + fail-loud serialize/parse.
4. **(test-first)** `__tests__/workspaceStore-characterization.test.ts` — lock current localStorage round-trip as equivalence target.
5. **(test-first)** `corpus/__tests__/` — in-memory fake + shared contract test (incl. S4 many-small-files access pattern) + layout/manifest unit tests.
6. `corpus/opfsAdapter.ts` — OPFS impl with SSR guard + typed-error mapping (quota not swallowed).
7. `corpus/flag.ts` + minimal `workspaceStore.ts` wiring — **DI seam typed as the `CorpusFS` interface** (default-off, dev-only).
8. Adapter error-path tests + flag-routing tests.
9. Out-of-CI Playwright OPFS smoke (Chrome+FF).
10. Docs (CLAUDE.md + `docs/thoughts/corpus-fs-seam.md`).

Implementation order: `[1,2,3,4] → 5 → 6 → 7 → 8 → 10`; 9 any time after 6.

## Invariants (filtered to S1's steps)
- No OPFS/`navigator.storage` access during SSR/render (guard + lazy init).
- Flag OFF must be byte-for-byte the current localStorage behavior (characterization test is the proof).
- Quota/failure paths reify into typed errors, never `console.warn`-swallowed (unlike workspaceStore.ts:44-46).
- Slug/path builders never escape `<corpus-root>/workspaces/` (no `..`/`/` traversal).
- `workspaceStore.ts` stays under ~500–600 lines; if step-7 wiring is >~30 lines, extract `corpus/storeAdapter.ts`.

## File map
- `app/lib/corpus/types.ts` — CorpusFS interface + error kinds (step 1, new)
- `app/lib/corpus/layout.ts` — path builders + slug sanitization (step 2, new)
- `app/lib/corpus/manifest.ts` — workspace.json schema + codec (step 3, new)
- `app/lib/corpus/opfsAdapter.ts` — OPFS implementation of CorpusFS (step 6, new)
- `app/lib/corpus/flag.ts` — dev-only default-off flag (step 7, new)
- `app/lib/corpus/storeAdapter.ts` — extract only if step-7 wiring grows (step 7, conditional new)
- `app/lib/stores/workspaceStore.ts` — inject CorpusFS-typed storage seam (step 7, edit)
- `app/lib/stores/__tests__/workspaceStore-characterization.test.ts` — equivalence baseline (step 4, new test)
- `app/lib/corpus/__tests__/corpusFs.contract.test.ts` — shared contract + in-memory fake (step 5, new test)
- `app/lib/corpus/__tests__/layout.test.ts` — path/slug tests (step 5, new test)
- `app/lib/corpus/__tests__/manifest.test.ts` — codec tests (step 5, new test)
- `app/lib/corpus/__tests__/opfsAdapter.test.ts` — error-path tests (step 8, new test)
- `app/lib/stores/__tests__/workspaceStore-corpus-flag.test.ts` — flag routing (step 8, new test)
- `(throwaway path)` Playwright OPFS smoke script (step 9, out-of-CI)
- `meta-formalism-copilot/CLAUDE.md` — document corpus module + flag + jsdom caveat (step 10, edit)
- `docs/thoughts/corpus-fs-seam.md` — seam notes for S2–S4 (step 10, new)

(16 entries — within the 20-entry checkpoint budget; no decomposition warning triggered.)

## Open questions
- **rm-on-missing**: resolved to idempotent (no-op) — confirm acceptable.
- **S1 flag-ON empty corpus**: resolved to initialize-clean (no localStorage migration in S1; that's S4) — confirm the dev-only flag framing is acceptable given enabling it in S1 does not carry existing work over.
- **Arch-review finding 5**: confirm no pre-existing "saved/persisted" affordance becomes misleading with the flag on (expected: none, since localStorage writes had no indicator).
- **Safari/OPFS**: deferred to pre-launch verification, not an S1 blocker — confirm.
