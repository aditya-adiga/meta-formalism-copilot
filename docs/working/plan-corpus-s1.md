# Plan: DD-009 corpus S0+S1 — CorpusFS interface + OPFS adapter (behind a flag)

- **Goal**: Implement the foundational corpus filesystem layer — a `CorpusFS` interface, folder/manifest contracts, and an OPFS-backed adapter that the workspace store can read/write through behind a feature flag — without disturbing the localStorage default, as the first sub-task of DD-009.
- **Project state**: `feat/corpus-architecture` carries the DD-009 decision + both iso-git spikes (merged from doc branches); this is the first of the S0–S5 sub-tasks from the decomposition · standalone otherwise · not blocked.
- **Task status**: in-progress (plan drafted, awaiting approval — implementation gated)

Research: docs/working/research-corpus-architecture.md
Decomposition: docs/working/decomposition-corpus-architecture.md
Test strategy: docs/working/test-strategy-corpus-s1.md

## Approach

Build the `CorpusFS` abstraction (the interface every later sub-task binds to) and an OPFS implementation of it as a self-contained `app/lib/corpus/` module, wired into the Zustand store only behind a **default-off, dev-only feature flag**. localStorage stays the production path untouched. Tests come first: a characterization baseline locks current localStorage behavior as the equivalence target, and a shared `CorpusFS` contract test (run against an in-memory fake in CI, against real OPFS via Playwright out-of-CI) verifies adapter logic despite jsdom lacking OPFS. This slice is deliberately reversible and ships no user-visible change — it exists to de-risk the contracts S2–S4 depend on.

**Two contract decisions resolved here** (surfaced by the test-strategy gap enumeration, G5/G15):
- `rm` on a missing path is **idempotent** (resolves, no-op) — desired-state FS semantics, simplest for callers.
- In S1's reduced (no-FSA, no-migration) scope, flag-ON + empty OPFS **initializes clean from `DEFAULT_STATE`**; it does **not** read or migrate localStorage. Consequence: enabling the flag in S1 does not carry existing localStorage work over — migration is S4. This is why the flag is dev-only and default-off (see Risks).

## Steps

1. **S0 — `CorpusFS` interface + error types.** New `app/lib/corpus/types.ts`: the async bytes+paths interface (`readFile→Uint8Array|null`, `writeFile`, `readdir`, `rm` idempotent, `stat→{size}|null`), plus a **single `CorpusErrorKind` source of truth** consumed by both a thrown `CorpusError` and the postMessage-serialized `CorpusWorkerError` (the two differ only in transport, never in the kind set — *arch-review finding 1*). Kinds are **substrate-neutral**: `quota-exceeded {needed, available, substrate:"opfs"|"fsa"|...}` (not `opfs-quota-exceeded`), `fsa-permission-revoked`, `remote-auth-expired`, `browser-storage-cleared`, `git-conflict {path}`, with a TS exhaustiveness helper. Also document in this file's header that **git is a separate `CorpusGit` interface layered *over* `CorpusFS`, not methods on it** — S3 must not widen `CorpusFS` (*arch-review finding 2*). (~100 lines, new file)
2. **S0 — folder layout path builders.** New `app/lib/corpus/layout.ts`: pure functions producing DD-009 §Folder-layout paths (manifest, source-by-id+ext, `artifacts/<type>/v####.md` zero-padded, custom-type def, decomposition) + workspace-slug sanitization that refuses `..`/`/`/traversal. (~110 lines, new file)
3. **S0 — `workspace.json` manifest schema + codec.** New `app/lib/corpus/manifest.ts`: the manifest type (sources, per-artifact current-version pointers, custom-type refs) + serialize/parse where malformed/absent JSON yields a typed recoverable error, never a silent empty manifest. (~120 lines, new file)
4. **Test-first — characterization baseline.** New `app/lib/stores/__tests__/workspaceStore-characterization.test.ts`: lock current localStorage round-trip (multi-version artifacts, custom types+data, transient-state sanitization) as the equivalence target. Commit separately (`test:`). Closes G16. (~150 lines, new test)
5. **Test-first — in-memory fake + contract/unit tests.** New `app/lib/corpus/__tests__/`: a Map-backed in-memory `CorpusFS` fake; a shared contract test (`corpusFs.contract.test.ts`) parameterized over an implementation; `layout.test.ts`; `manifest.test.ts`. These are red until step 6/the codecs land. Closes G1,G2,G4,G5,G6,G9,G10,G11,G12. Commit `test:`. (~250 lines across files, new tests)
6. **Implement OPFS adapter.** New `app/lib/corpus/opfsAdapter.ts` over `navigator.storage.getDirectory()`: SSR/no-`navigator.storage` guard rejects with a typed error; nested-path creation; quota errors mapped to `opfs-quota-exceeded` (no `console.warn`-swallow). Make the contract test pass against the in-memory fake; the adapter shares the same suite. (~220 lines, new file)
7. **Feature flag + injectable adapter selection.** New `app/lib/corpus/flag.ts` (default-off, dev-only env/localStorage gate) + minimal wiring in `app/lib/stores/workspaceStore.ts` so the store's storage path is dependency-injected. **The injection seam's static type MUST be the `CorpusFS` interface** (not the concrete `opfsAdapter`), so the S3 worker-proxy is a drop-in without re-opening the store — this is the single most load-bearing structural decision in S1 (*arch-review finding 3*). The localStorage default is expressed as a clearly-separated adapter behind the same seam. (~80 lines, 1 new file + small store edit)
8. **Adapter error-path + flag-routing tests.** New `app/lib/corpus/__tests__/opfsAdapter.test.ts` (stubbed `navigator.storage` that throws → assert `err.kind`) + `app/lib/stores/__tests__/workspaceStore-corpus-flag.test.ts` (flag OFF → localStorage, `getDirectory` never called via spy; flag ON+injected fake → routed through CorpusFS). Closes G7,G8,G13,G14,G15. (~180 lines, new tests)
9. **Playwright OPFS smoke (out-of-CI, pre-merge).** Reuse the iso-git spike harness shape to run the shared contract suite against real Chrome+Firefox OPFS (byte round-trip + quota typed error). Not added to CI; documented as a pre-merge manual gate (the deferred half of DD-009's spike-validation extension). (~60 lines script, on a throwaway path)
10. **Docs.** Update `meta-formalism-copilot/CLAUDE.md` (new `app/lib/corpus/` module, the flag, jsdom-OPFS caveat) and add a short `docs/thoughts/corpus-fs-seam.md` describing the CorpusFS seam for S2–S4. (small)

## Implementation order

`[1, 2, 3, 4] → 5 → 6 → 7 → 8 → 10`, with **9 runnable any time after 6** (parallel to 7/8), and **10 last**.

Reading: steps 1–3 are independent pure-module files and 4 (characterization) depends only on the existing store, so all four can be done in any order / parallel. Step 5's contract+unit tests depend on the step-1–3 signatures. Step 6 (adapter) depends on 1–3 and is verified by 5. Step 7 (flag/wiring) depends on the adapter existing. Step 8's tests depend on 7. Step 9 (Playwright) needs only the adapter (6). Step 10 documents the finished seam.

## Size estimate

All new files are well under the 500-line limit (largest: opfsAdapter ~220, contract tests ~250 split across files). The only edit to an existing file is step 7's injectable-adapter wiring in `workspaceStore.ts` (currently 575 lines) — keep it minimal (~30 lines: extract the storage-adapter selection behind a factory); if it would push the file past ~600, extract the adapter selection into `app/lib/corpus/storeAdapter.ts` instead. Net new: ~1100 lines, ~70% tests.

## Estimated context cost

Research ~30k (complete), Implementation ~55k, Review ~20k.

## Actual context cost (post-implementation)

__ (to fill in during step 6/7)

## Test specification

Folded from the test-strategy auto-invoke (full artifact: docs/working/test-strategy-corpus-s1.md; gap list G1–G16 there). The skill ran and returned 16 gaps; below maps each recommended test to gaps and a diagnostic expectation.

| Test case | Expected behavior | Level | Diagnostic expectation | Closes gaps |
|---|---|---|---|---|
| Characterization: 3-version artifact + 2 custom types round-trip localStorage | All versions, `currentVersionIndex`, custom defs+data preserved; `"verifying"`→`"none"` | characterization | print full deep-diff of expected vs rehydrated state | G16 |
| CorpusFS contract (in-memory fake): missing→null/[], byte round-trip (256 distinct bytes), nested-path readdir, rm idempotent, stat, **+ S4 access pattern: write ~30 small files under one artifact dir, readdir, read each back** (*arch-review finding 4*) | Interface honored identically by any impl; fit for files-per-artifact | contract | print path + expected vs actual bytes/length on mismatch | G1,G2,G4,G5,G6 |
| OPFS adapter: no `navigator.storage` env | rejects with typed `{kind}` error, not `TypeError` | unit | assert on `err.kind`; print full typed error object | G8 |
| OPFS adapter: underlying handle throws quota error | rejects `kind:"opfs-quota-exceeded"` w/ `needed`/`available` | unit | print the mapped error object | G7 |
| Layout: version/source/custom paths exact; slug sanitization of `../`,`a/b`,unicode | matches DD-009 layout; never escapes `workspaces/` | unit | print offending input → produced path | G9,G10 |
| Manifest: round-trip lossless; `"{ not json"` and `"{}"` | deep-equal on round-trip; typed recoverable error on malformed | unit (round-trip property-flavored) | print parse error kind; print round-trip diff | G11,G12 |
| Flag OFF (default) | localStorage used; `navigator.storage.getDirectory` never called | integration | spy assertion; print call count | G13 |
| Flag ON + injected in-memory CorpusFS | reads/writes routed through CorpusFS; localStorage untouched | integration | print which adapter received the write | G14,G15 |
| Playwright OPFS smoke (out-of-CI) | real Chrome+FF: byte round-trip + quota typed error | e2e (manual) | script prints per-op result verbatim (spike style) | G1,G2,G7 (real-env) |

## Failure modes considered

**Gate decisions (both Round-1 triggers evaluated independently):**
- **`/pre-mortem`: not triggered.** S1 does not meet the high-stakes criteria — it is flag-gated (default-off), fully reversible (new module + one small wiring edit), the slice is ~1100 lines but ~70% tests and no single concern >500 LOC, it crosses no security/auth boundary (OPFS is origin-sandboxed; no untrusted input crosses), and `CorpusFS` is an internal contract, not a public/external API. A pre-mortem already exists at the **DD-009 level** — the Node spike's `/pre-mortem` produced 5 failure narratives (docs/spikes/isomorphic-git-perf-50mb.md §Failure narratives), carried into the decomposition; S1-specific failures are the table below.
- **`/architecture-review`: triggered** — the plan's Files to touch span ≥2 modules (new `app/lib/corpus/` module + `app/lib/stores/` wiring + build/config) and S1 establishes the foundational `CorpusFS` boundary and its dependency direction, which is exactly the structural decision arch-review exists to catch before code commits. Run on this plan; output at `docs/reviews/architecture-review.md`. **Findings 1–3 (substrate-neutral single error-kind source; git as a separate `CorpusGit` interface; DI seam typed as `CorpusFS`) have been folded into steps 1 and 7 above; finding 4 (S4 access-pattern contract case) into the Test specification; finding 5 (no misleading "saved" in S1) noted — confirm during step 7.**

| Failure mode | Guard |
|---|---|
| OPFS adapter "passes" in CI only because jsdom silently lacks OPFS, masking real breakage | Structural: contract suite runs against the in-memory fake in CI AND a Playwright real-OPFS smoke (step 9) gates pre-merge; the SSR-guard test (G8) asserts the no-`navigator.storage` path rejects loudly rather than no-oping |
| Enabling the flag silently discards a user's localStorage workspace (no migration yet) | Structural: flag is default-off + dev-only (step 7); plan + CLAUDE.md state explicitly that S1 flag-ON starts clean and migration is S4; characterization baseline (step 4) proves the OFF path is untouched |
| Quota-exceeded write is swallowed (repeating the existing `console.warn` silent-degradation at workspaceStore.ts:44-46) | Test G7 asserts the adapter rejects with `kind:"opfs-quota-exceeded"`; no `catch`-and-warn in the adapter |
| Workspace title with `..`/`/` escapes the corpus root (path traversal) | Test G10 asserts slug sanitization; layout builders are the only path source |
| Malformed `workspace.json` silently parsed as empty → looks like data loss | Test G12: parse of malformed/empty manifest yields a typed recoverable error, never a default-empty manifest |

## Risks

- **The in-memory fake may diverge from real OPFS semantics** (ordering, async timing, quota behavior). Mitigated not eliminated by the Playwright smoke (step 9) and by keeping the fake minimal/faithful. This is the main residual risk after the plan (test-strategy Summary).
- **Safari/WebKit OPFS is still unmeasured** (both spikes deferred it); S1's Playwright smoke covers Chrome+FF only. Safari stays a pre-launch verification item per the browser smoke spike, not an S1 blocker.
- **Deferred coverage (from test-strategy "Beyond scope"):** multi-tab OPFS contention (matters in S4), and characterization baselines for the other three localStorage stores (`workspace-sessions-v1`, `metaformalism-sessions`, `evidence-store-v1`) — relevant to S4 migration, not S1.
- **Store-wiring creep:** step 7 edits `workspaceStore.ts` (575 lines); if the injectable-adapter change is larger than ~30 lines, extract to `app/lib/corpus/storeAdapter.ts` to stay under the 500-line guideline.

## Rollback

This slice ships no user-visible change (flag default-off), so post-ship rollback is low-stakes:

1. `git revert <s1-merge-sha>` on `main` — removes the entire `app/lib/corpus/` module and the step-7 wiring atomically. Because the flag is default-off, no production data path used the adapter, so revert has no data-state consequence.
2. If only the wiring is suspect (adapter module is harmless dead code), instead revert just the step-7 commit (`git revert <step7-sha>`) to restore the unconditional localStorage adapter selection in `workspaceStore.ts`, leaving the module in place.
3. No schema/data migration to undo (S1 introduces none), no cache to invalidate, no remote/service to restart. No feature flag to flip in prod because it is never enabled in prod.
4. **No irreversible component.** The only persistent side effect possible is OPFS files written during *dev* testing with the flag on; clear them with `await (await navigator.storage.getDirectory()).removeEntry('workspaces', {recursive:true})` in the dev console, or via the browser's site-data clear.
