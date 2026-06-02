# Performance Review — feat/corpus-architecture (DD-009 S0+S1)

**Scope:** `git diff main...HEAD -- app/` (corpus FS abstraction + OPFS adapter + store seam)
**Date:** 2026-06-01
**Based on:** Stage-1 code fact-check (`docs/reviews/code-fact-check-report.md`: 11 Verified, 1 Mostly Accurate, 0 Incorrect); iso-git perf spike (`docs/spikes/isomorphic-git-perf-50mb.md`, `docs/thoughts/isomorphic-git-perf-characteristics.md`)

## Data Flow and Hot Paths

This slice adds `app/lib/corpus/` — a `CorpusFS` byte/path filesystem interface (`types.ts`), an OPFS adapter (`opfsAdapter.ts`), folder-layout path builders (`paths.ts`), a `workspace.json` codec (`manifest.ts`), a default-off dev flag (`flag.ts`), and a Zustand storage-seam selector (`storeAdapter.ts`). It also extracts the pre-existing debounced-localStorage adapter out of `workspaceStore.ts` into `storeAdapter.ts`.

**Path temperature.** Everything new is **cold or behind a default-off, dev-only flag**:

- `isCorpusEnabled()` is false unless `NEXT_PUBLIC_CORPUS_FS=1` at build time or `localStorage["corpus-fs-enabled"]==="1"` at runtime in a dev browser. With the flag off, none of the OPFS code executes.
- The production path is the **unchanged** debounced-localStorage adapter, moved verbatim (the characterization test asserts byte-for-byte parity). The default user-facing write path is identical to main.
- When the flag *is* on, the store persists a **single blob file** (`state/<name>.json`) via `CorpusFS` — one `writeFile`/`readFile` per persist cycle, debounced by zustand's own middleware. This is one FS op per save, not the many-small-files pattern.
- The many-small-files access pattern (files-per-artifact, potentially hundreds per workspace) is **S4 — not in this diff.** `paths.ts`/`manifest.ts` are built but unused by the store until S4. So the directory-walk question below is forward-looking: it asks whether *this S1 implementation* will hold up when S4 starts calling it per-file.

**Baseline availability.** The iso-git spike measured `isomorphic-git` over a `lightning-fs` (IndexedDB) / Node `fs` adapter — it did *not* measure this branch's `CorpusFS` OPFS adapter, and specifically did not measure per-operation `getDirectoryHandle` walk cost on OPFS. There is no measurement of any code path in this diff. Per the skill's Baseline Requirement, **every finding below is flagged speculative.** The spike numbers are cited only as adjacent context, never as a baseline for this code.

## Findings

#### `walkDir` re-resolves the full directory chain on every single-file operation

**Severity:** Low (Medium *iff* S4 ships an unbatched per-file loop unchanged)
**Location:** `app/lib/corpus/opfsAdapter.ts:66-77` (callers: `readFile` 91, `writeFile` 111, `readdir` 129, `rm` 143, `stat` 160)
**Move:** Hidden multiplication (#1) / asymptotic behavior (#9)
**Confidence:** Medium
**Baseline:** no baseline available — flagged as speculative
**Legibility-target:** the S4 author (downstream implementer of the files-per-artifact layout)

Every `CorpusFS` op resolves its parent directory from the OPFS root by awaiting `getDirectoryHandle` once per path segment (`for (const d of dirs)`). For the S1 blob path (`state/<name>.json`, depth 1) this is one extra async handle resolution per save — negligible. The concern is the **S4 access pattern**: artifact files live at `workspaces/<slug>/artifacts/<type>/v####.md` — depth 4. If S4 reads or writes K files in a loop (e.g. loading every artifact version on workspace open, or rewriting the manifest + N version files on save), each call re-walks all 4 segments from root, so the directory-resolution work is `O(K × depth)` async round-trips even though all K files share the `workspaces/<slug>/...` prefix. With hundreds of small files per workspace, that's hundreds × 4 sequential `await getDirectoryHandle` calls, each an OPFS round-trip, none of them cached or batched. Whether this is a real cliff depends entirely on (a) how many files S4 touches per operation and (b) OPFS `getDirectoryHandle` per-call latency, neither of which is measured. The iso-git spike's "45MB random + 150 small files → FS" build at ~92ms on Chrome (IndexedDB, not OPFS, and via iso-git's own batched FS layer, not this adapter) is the closest adjacent data point and is not directly comparable.

This is correctly **not** a finding against S1 as shipped — at depth-1, one-file-per-save, it is immaterial, and the flag is off in production. It is flagged so the S4 author does not build a naive per-file loop on top of this interface and discover the walk cost only under load.

**Recommendation:** Do not change S1. When S4 lands the files-per-artifact layout, add a directory-handle-resolution helper that caches/reuses the resolved `workspaces/<slug>/` (and `artifacts/<type>/`) handles across a batch of operations, and/or expose a batch read/write on `CorpusFS` so the walk amortizes. Before S4 locks its write strategy, capture an OPFS micro-benchmark of `getDirectoryHandle` latency and a 200-small-files read/write loop (the spike's "Spike validation extension" gate is the natural place) so the batch-vs-per-file decision rests on a number.

#### `readdir` materializes the full child list via async iteration before sorting

**Severity:** Low
**Location:** `app/lib/corpus/opfsAdapter.ts:125-137`
**Move:** Trace the memory lifecycle (#4) / serialization tax (#6)
**Confidence:** High
**Baseline:** no baseline available — flagged as speculative
**Legibility-target:** the S4 author

`readdir` drains `dir.keys()` into a `string[]` with `for await ... names.push(key)`, then `names.sort()`. This is the correct and only shape the `CorpusFS` contract allows (it returns `string[]`, names only), and for the realistic directory sizes here it is fine: an artifacts/<type> directory holds one file per version (bounded by version count), and a workspace's `sources/` holds one file per source. The materialization is `O(entries)` memory and the sort is `O(entries log entries)` — both trivial at the expected tens-to-low-hundreds of entries. The only scenario where this would matter is a directory with tens of thousands of entries (e.g. a workspace that accumulated thousands of artifact versions in one flat directory), which the folder layout does not currently produce. No streaming/early-exit is possible given the return type, and none is warranted.

**Recommendation:** No change. If a future caller needs only "does this directory have any entries" or "first N entries," consider adding a narrower `CorpusFS` method (e.g. a bounded/streaming list) rather than forcing every caller through full materialization — but only when such a caller actually exists. Note for S4: don't use `readdir` + per-name `stat` to discover the current artifact version; the manifest (`manifest.ts`) is the index precisely so consumers avoid scanning every file (per its own docstring).

#### Debounced-localStorage path is unchanged — confirmed (positive)

**Severity:** Informational
**Location:** `app/lib/corpus/storeAdapter.ts:25-46` (was `workspaceStore.ts` `createDebouncedStorage`)
**Move:** Find the work that moved to the wrong place (#3)
**Confidence:** High
**Baseline:** no baseline available — flagged as speculative
**Legibility-target:** the PR reviewer

The default production write path (`createDebouncedLocalStorage`) is the prior `createDebouncedStorage` moved verbatim from `workspaceStore.ts` into `storeAdapter.ts`: synchronous reads, 300ms-debounced writes, same quota-swallow behavior, same `removeItem` clear-pending logic. The diff confirms this is a pure relocation (the deleted block and the new block are identical in behavior), and the characterization test asserts byte-for-byte parity. No work moved into or out of the hot path; no new per-keystroke serialization was introduced; the debounce timer is still the single coalescing point. This is the correct way to introduce a seam without perturbing the default path.

**Recommendation:** None. This is the right pattern. (Separately noted, not a perf concern for S1: the corpus-backed `setItem` at `storeAdapter.ts:61-63` is *not* debounced — it writes on every zustand persist. That is fine for the S1 blob path because zustand's persist middleware already coalesces state writes, but the S4 author should confirm the persist cadence before assuming the OPFS write rate is bounded.)

#### S4 scaling note: files-per-artifact + manifest rewrite is a write-amplification risk (forward-looking)

**Severity:** Informational (not in this diff)
**Location:** `app/lib/corpus/manifest.ts` (index) + `app/lib/corpus/paths.ts:88-94` (per-version files) — consumed in S4, not S1
**Move:** Ask "what's the size of N?" (#2) / hidden multiplication (#1)
**Confidence:** Low
**Baseline:** no baseline available — flagged as speculative
**Legibility-target:** the S4 author

When S4 swaps the store from blob mode to the folder layout, each save potentially writes a new `v####.md` file *and* rewrites `workspace.json` (the manifest, which holds the current-version pointer per artifact type, the source list, and customTypeIds). If S4 rewrites the whole manifest on every artifact edit, manifest write cost grows with workspace size (number of sources + artifact types + custom types), and is paid on every save. With hundreds of small files per workspace the manifest itself stays small (it is pointers, not bodies), so this is likely fine — but it is the kind of "rewrite the whole index on every leaf change" pattern that turns into write amplification if the manifest ever grows to hold per-version history rather than just current-version pointers. The S1 codec is correctly minimal (pointers only); the risk is purely in how S4 chooses to update it.

**Recommendation:** No change to S1. Flag for the S4 design: keep the manifest as current-version pointers only (resist the temptation to inline per-version history into it), and confirm the save path does one manifest write per save, not one per touched artifact type. This composes with the `walkDir` finding — a single batched "write N version files + 1 manifest" operation amortizes both the directory walk and the manifest rewrite.

## What Looks Good

- **Default path untouched.** The production localStorage path is a verbatim move with a characterization test asserting byte-for-byte parity. Zero perf risk to current users.
- **One FS op per save in S1.** Blob mode means the OPFS path does a single `writeFile`/`readFile` per persist cycle, not the many-small-files pattern — the expensive access pattern is deferred to S4 where it can be designed against measured OPFS numbers.
- **Manifest as a thin index.** `manifest.ts` deliberately stores only current-version pointers, not artifact bodies, so "open a workspace" does not require scanning every file. The docstring states this intent explicitly. This is the right call for the S4 access pattern.
- **`readdir` materialization is bounded by the folder layout.** No directory in the layout grows to a size where full materialization + sort matters.
- **Path-builder cost is trivial.** `paths.ts` builders are pure string ops with regex sanitization on short inputs; the regexes have no catastrophic-backtracking shape and run on path-segment-length strings. Not a hot-path concern.
- **No caches introduced** (so no eviction/invalidation/hit-rate concerns), **no locks or shared mutable state added** (each adapter call resolves from root independently — which is the source of the walk cost, but also means zero contention), and **no synchronous work inserted into the async pipeline.**

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 1 | `walkDir` re-resolves full chain per op; S4 per-file loop risk | Low (Medium if S4 unbatched) | `opfsAdapter.ts:66-77` | Medium |
| 2 | `readdir` materializes full child list before sort | Low | `opfsAdapter.ts:125-137` | High |
| 3 | Debounced-localStorage path unchanged (positive) | Informational | `storeAdapter.ts:25-46` | High |
| 4 | S4 manifest-rewrite write-amplification (forward-looking) | Informational | `manifest.ts` / `paths.ts:88-94` | Low |

## Overall Assessment

The performance posture of this slice is **clean**. The production path is byte-for-byte unchanged, the new code is behind a default-off dev flag, and in S1 the OPFS adapter does one FS operation per debounced save (blob mode) — there is no hot path and no scaling cliff *in this diff*. The single substantive finding (`walkDir` re-resolving the full directory chain per operation) is correctly immaterial at S1's depth-1, one-file-per-save usage; it becomes a real concern only if the S4 author builds a naive unbatched per-file loop on top of this interface, at which point directory-resolution becomes `O(files × depth)` sequential OPFS round-trips. The right action is **not** to optimize S1 — it would be premature and the flag is off — but to carry a documented seam note into S4 so the batching/handle-caching decision is made deliberately and against a measured OPFS micro-benchmark (which does not yet exist; the spike measured iso-git over IndexedDB/Node, not this adapter over OPFS). No fix is needed to merge this PR on performance grounds. Profiling is needed before S4 locks its write strategy, not before this merges.

## Goal-Alignment Note

The stated goal was a performance review of the corpus FS layer ahead of a PR, with explicit focus on (1) the `walkDir` per-op directory walk under the S4 many-small-files pattern, (2) `readdir`'s async-iteration array build, (3) confirming the debounced-localStorage path is unchanged, and (4) anything that scales badly at files-per-artifact. All four were addressed: (1) is Finding 1, scoped as forward-looking-to-S4 with a concrete batching/handle-cache recommendation; (2) is Finding 2, judged bounded by the folder layout; (3) is Finding 3, confirmed verbatim with parity-test backing; (4) is Finding 4 plus the S4 notes threaded through Findings 1 and 3. Per the instruction to keep findings proportionate to a default-off, non-hot-path slice, no S1 code change is recommended and no micro-optimizations are flagged — the report deliberately downgrades the directory-walk concern to Low for the code as shipped and reserves the higher severity for the S4 usage that is not in this diff. All findings are flagged speculative because no measurement of this adapter's OPFS path exists; the iso-git spike numbers are cited as adjacent context only, never as a baseline for this code.
