# Spike: Does `isomorphic-git` sustain DD-009's latency budget on a 50–100MB synthetic workspace?

Date: 2026-06-01
Last verified: 2026-06-01
Relevant paths: docs/decisions/009-artifact-corpus-architecture.md
Branch: spike/isomorphic-git-perf-50mb-2026-06-01 (can be deleted)
Time spent: ~30 minutes

- **Goal**: Empirically validate the perf assumption baked into DD-009 §Consequences ("isomorphic-git in the browser has performance characteristics that need empirical validation on workspaces with 50–100MB of source PDFs") so the RPI loop can start with a calibrated baseline rather than a guess.
- **Project state**: Standalone spike feeding the DD-009 implementation RPI loop · sequencing: precedes RPI step 1 (research) · not blocked.
- **Task status**: complete

## Answer

**Conditional go.** On Node.js with the native `fs` adapter, `isomorphic-git@1.38.3` clears every binary criterion with 5–35× headroom on both 50MB and 100MB corpora shaped to DD-009's folder layout: checkout 258ms / commit p50 13ms p95 116ms / log over 200-commit per-file history 278ms / pack-build (push-equivalent) 158ms. Scaling from 50MB → 100MB is near-linear (no cliff visible). The "conditional" qualifier is the Node→browser gap: this spike does not measure OPFS-backed performance in the browser. Node hits SHA1 and zlib hardware paths and faster syscalls; browser WASM is 5–30× slower for SHA1, OPFS sync I/O has worse tail latency, and Safari/Firefox OPFS implementations are newer. The numbers reported here are an **upper bound on what production will deliver**, not a prediction of production. A browser smoke test on the same workspace is required before the RPI plan commits to user-facing perf claims (see RPI seed, "Spike validation extension").

## Key findings

**Measurements (medians across 20 commits per run):**

| Operation | 50MB workspace | 100MB workspace | Binary criterion | Headroom vs failure threshold |
|---|---|---|---|---|
| Cold-start (iso-git checkout, post-fetch) | 258ms | 475ms | < 60s clone budget | ~125× (50MB), ~60× (100MB) |
| Commit p50 | 13ms | 13ms | < 500ms | ~38× |
| Commit p95 (over 20 samples) | 116ms | 155ms | < 2s failure | ~13× |
| `git log <file>` (200-commit history, follow-up run) | 278ms (Node) | — | < 1s success / < 5s failure | ~3.6× success / ~18× failure |
| Pack-build (push-equivalent) | 158ms | 285ms | < 5s commit budget for push pre-wire | ~17× |
| Peak RSS during run | 174MB | 339MB | informational | n/a |

**What worked:**
- iso-git's `clone`-equivalent path (FS copy of bare `.git` + `git.checkout`) was fast enough that the rest of cold-start time is dominated by the wire transfer (network-bound, not iso-git's problem).
- Commit-path latency is well below human perception (median 13ms). Even the 100MB tree commit-time is dominated by index-update work, not by walking the source tree.
- Log over a 200-commit per-file history was 278ms — the F6 provenance primitive (`git log <artifact-path>`) is interactive in Node.
- `packObjects` (the work iso-git does locally before a push hits the wire) was 158ms for 21 commits totaling a 3KB pack. No surprise: the bulk source-tree data isn't repacked on every commit.
- Memory stayed well under 1GB throughout. Pack files were tiny when nothing changed.

**What didn't / gotchas:**
- iso-git's `clone` requires HTTP — there is no `file://` adapter. For the spike I simulated cold-start as `fs.cpSync(REMOTE, .git) + git.checkout`, which is what iso-git is doing on the receiving end of a real clone. This is honest for the "iso-git's algorithmic cost" question but does not measure wire-transfer or HTTP-protocol overhead. Production cold-start will add the wire-transfer time, which is the dominant network cost.
- The push measurement is `packObjects` only — the work iso-git does locally before shipping. The wire-transfer cost is network-bound and out of iso-git's hands.
- The p95 over 20 commits is effectively the max sample (Math.floor(20*0.95) = 19). For a real p95 ≥100 commits are needed. The p50 ↔ max ratio (~9×) suggests the first commit pays setup cost (index load); steady-state is the p50.
- **The 200-commit per-file log was a follow-up run, not part of the main 50MB/100MB runs.** In the main runs, every artifact was created in one bootstrap commit, so `log(filepath)` showed 1 commit (uninteresting). The follow-up confirms log scales near-linearly with commits-touching-the-file: 200 commits → 278ms in Node, so 1000 commits → ~1.4s, 3000 commits → ~4.2s. The DD-009 revisit-trigger ">1000 versions in 3 months" is in the ambiguous-to-pass zone on Node and would likely cross the 5s failure threshold in browser at ~2000 commits. **This is the one place where Node-side headroom gets thin.**

**Surprises:**
- Memory cleanup after the run was poor (RSS sticky at ~340MB after 100MB run finished). Not a blocker for a long-running browser tab but worth watching.
- 100MB corpus expands to 217MB on disk (working tree + .git). The pack file is small (no redundancy in random PDF bytes), but the WT + WT-copy-in-.git costs add up. Implications for OPFS quota are real but downstream of the perf question.

## Recommendation

**Proceed to RPI**, with the Spike validation extension (see seed below) as a gate before perf-sensitive design choices are locked in. The Node-side evidence is strong enough that the architecture survives if browser is even 30× slower; the residual risk is in the deep-history scaling (gotcha above) and the failure-driven UI states DD-009 already names.

## RPI seed

- **Scope for RPI**: Implement DD-009 #4' (OPFS local cache + opt-in FSA folder mirror + opt-in git remote sync), starting from a clean `feat/corpus-architecture` branch, replacing the localStorage-based persistence in `useWorkspacePersistence` and the snapshot-bridge logic in `app/page.tsx:135-184`.
- **Known invariants** (carried from the spike):
  - iso-git's `clone` is HTTP-only; production cold-start needs an HTTP transport (the project's existing API routes can proxy if user picks GitHub/GitLab; `isomorphic-git/http/web` is the browser adapter).
  - `git.log({ filepath })` over a 200-commit per-file history is 278ms in Node and scales near-linearly. The version-history side panel MUST NOT call `git.log` eagerly on mount without pagination. Use `git.log({ filepath, depth: 30 })` for initial render and cursor-based pagination for the rest.
  - The OPFS writer should run in a dedicated worker (iso-git CPU bursts off the main thread), and every worker error must be reified into a typed `CorpusWorkerError` discriminated union with one variant per failure-driven UI state (see Failure narratives 3, 4).
  - Push pre-wire (`packObjects`) at ~21 commits is sub-second; production wire transfer is the dominant push cost and is network-bound.
- **Relevant files/APIs**:
  - `app/hooks/useWorkspacePersistence.ts` — current localStorage persistence, replace.
  - `app/page.tsx:135-184` — `getWorkspaceSnapshot` / `resetWorkspaceToSnapshot`, delete in favor of folder-load.
  - `app/lib/stores/` (Zustand stores) — `customArtifactTypes` and `customArtifactData` slices need to read/write through the corpus adapter, not directly.
  - `package.json` — add `isomorphic-git@^1.38.3` and `@isomorphic-git/lightning-fs` (the OPFS-backed FS adapter).
  - DD-009 §Folder layout — the concrete corpus shape.
- **Gotchas to carry forward**:
  - The browser-side numbers will be worse than spike numbers. Plan for at least 5–10× slowdown on commit p50 and 3× on log; budget perf headroom accordingly.
  - 100MB corpus → 217MB on disk after working tree + .git. OPFS quota is proportional to free disk on Chrome and per-origin on Firefox; surface quota-warning UI well before the wall.
  - The "1 commit per file in the bootstrap" pattern from the spike hides the F6 worst case; in production, artifacts will accumulate per-file commit history, and `log` cost scales with that count.
- **Failure narratives (from /pre-mortem)** — 3 must-address, 1 worth-mitigating, 1 acknowledged-risk:
  1. **The browser-perf cliff** (Likely / High) — Node lied; browser commit p95 may exceed budget. *Mitigation:* Spike validation extension before RPI plan locks in perf claims.
  2. **The 3000-version cliff on the F6 path** `[PRIOR CONSIDERATION: DD-009 §Revisit triggers]` (Plausible / High) — eager `git.log` on panel mount hangs power users. *Mitigation:* lazy-paginated `git.log` + CI benchmark at 100/500/2000 commits.
  3. **OPFS quota exception swallowed in a worker** `[PRIOR CONSIDERATION: DD-009 §Failure-driven]` (Plausible / Catastrophic) — silent data loss. *Mitigation:* typed `CorpusWorkerError` discriminated union with TS exhaustiveness check; quota events fire UI state.
  4. **FSA permission silently revoked across browser restart** `[PRIOR CONSIDERATION: DD-009 §Failure-driven]` (Likely / High) — "saved" indicator lies. *Mitigation:* save-indicator state tied to FSA-mirror enqueue ack, not OPFS commit ack; "saved locally — corpus folder not connected" prominent CTA.
  5. **iso-git CVE without upstream patch** `[PRIOR CONSIDERATION: DD-009 §Revisit triggers]` (Unlikely-but-catastrophic / High) — single-maintainer fork-or-rip-out. *Revisit trigger:* monthly dependency-health workflow that flags iso-git latest release >12 months old OR any open critical-severity GitHub advisory.
- **Spike validation extension (RPI gate)**: Before the RPI plan's perf-sensitive design choices are locked in (write-path debounce, log pagination depth, worker count), run a 30-minute browser smoke-test against the same 50MB corpus using `@isomorphic-git/lightning-fs` on OPFS in headless Chrome/Firefox/Safari (Playwright). Measure commit p50/p95 and `git.log({filepath, depth:200})`. Gate criterion: commit p95 < 200ms on Chrome, < 500ms on Firefox/Safari; `log` < 1s at 200 commits. If any gate fails, the RPI plan must adjust the write-path debounce/queue strategy before proceeding.
- **What the spike did NOT answer**:
  - Browser-side performance under OPFS, in any browser.
  - HTTP-transport overhead for real `clone` against GitHub/GitLab.
  - Behavior under simultaneous-tab writes (the OPFS-quota / lock contention failure mode).
  - Conflict-resolution behavior when two devices have edited the same file (DD-009 picks last-write-wins for v1, but the mechanism isn't tested here).
  - Push-pull round-trip cost against a real remote (we measured pack-build only).
  - Behavior of `isomorphic-git`'s `walk` / `log` over a 5000+ commit history (the next decile of the scaling curve).

## Measurement script

`/tmp/iso-git-spike/spike.mjs` (50MB and 100MB runs) and `/tmp/iso-git-spike/spike-log-history.mjs` (200-commit per-file log stress). On the spike branch — both deletable with the branch.

## Raw output (verbatim from final run)

```
50MB:  built 49ms, checkout 258ms, commit p50 13ms p95 116ms, log(file)/full 114ms/71ms, pack 158ms, rss 174MB
100MB: built 76ms, checkout 475ms, commit p50 13ms p95 155ms, log(file)/full 155ms/121ms, pack 285ms, rss 339MB
200-commit per-file history: log(filepath) 278ms, log(dir) 232ms, log(full, 200 commits) 43ms
```
