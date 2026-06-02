# Spike: Browser smoke test — does iso-git keep its Node-side margins in real browsers?

Date: 2026-06-01
Last verified: 2026-06-01
Relevant paths: docs/decisions/009-artifact-corpus-architecture.md · docs/spikes/isomorphic-git-perf-50mb.md
Branch: spike/iso-git-browser-smoke-2026-06-01 (can be deleted)
Time spent: ~40 minutes (including a 10-min detour to discover and fix iso-git's UMD `Buffer is not defined` requirement)

- **Goal**: Close the explicit gap the prior spike named — measure `isomorphic-git@1.38.3` against `@isomorphic-git/lightning-fs@4.6.2` in real headless browsers, so the RPI plan starts from observed browser numbers rather than the Node-side upper bound.
- **Project state**: Follow-up to [docs/spikes/isomorphic-git-perf-50mb.md](isomorphic-git-perf-50mb.md) — fulfils the "Spike validation extension" gate named in its RPI seed · not blocked.
- **Task status**: complete

## Answer

**Strong go for the perf axis.** Both Chromium and Firefox cleared every budget with 4–14× headroom on a 50MB DD-009-shaped workspace, and browser-side numbers are within 1–2× of the Node baseline for steady-state operations — *not* the 5–30× slowdown the prior spike's pre-mortem narrative #1 assumed. Two gaps remain: Safari/WebKit (Playwright's WebKit binary doesn't run reliably on WSL2; deferred to a macOS environment) and OPFS-backed adapter (this spike tested lightning-fs IndexedDB; OPFS is DD-009's target but is expected to be similar-or-faster).

## Measurements (50MB corpus, headless on WSL2 Linux)

| Operation | Node | Chromium | Firefox | Chrome gate (this spike) | FF gate |
|---|---|---|---|---|---|
| Corpus build (45MB random + 150 small files → FS) | ~50ms (sync fs) | 92ms | 228ms | informational | informational |
| Bootstrap (init + add-all + commit) | ~7ms (native git) | 739ms (iso-git) | 1.10s (iso-git) | informational | informational |
| iso-git checkout post-pack | 258ms | 319ms | 517ms | n/a | n/a |
| Commit p50 over 20 samples | 13ms | 14ms | 19ms | n/a | n/a |
| Commit p95 over 20 samples | 116ms (max-of-n) | **17ms** | **35ms** | <200ms ✅ (~12× headroom) | <500ms ✅ (~14×) |
| `log({filepath})` over 100-commit history | — | **235ms** | **400ms** | <1s ✅ (~4×) | <2s ✅ (~5×) |
| `log(filepath)` Node-side at 200 commits (reference) | 278ms | — | — | — | — |
| `packObjects` (50 commits, push pre-wire) | 158ms | 40ms | 43ms | n/a | n/a |

Versions: `isomorphic-git@1.38.3` · `@isomorphic-git/lightning-fs@4.6.2` · `playwright@1.60.0` · Chrome Headless Shell 148.0.7778 · Firefox 150.0.2.

## Extrapolation to the >1000-version stress point

`git.log({filepath})` scales near-linearly with commits-touching-the-file. Browser-side scaling holds the Node ratio (~1.6× Chrome, ~2.7× Firefox for log-at-100):

| Per-file commits | Node (measured/extrap) | Chromium (extrap) | Firefox (extrap) |
|---|---|---|---|
| 100 | ~139ms | 235ms (measured) | 400ms (measured) |
| 200 | 278ms (measured) | ~470ms | ~800ms |
| 1000 | ~1.4s | ~2.4s | ~4s |
| 3000 | ~4.2s | ~7s | ~12s |

The pre-mortem narrative #2 (3000-version `git.log` cliff on the F6 path) is confirmed: at 3000 per-file commits, Chromium crosses the 5s budget, Firefox crosses ~12s. The lazy-pagination mitigation named in the prior spike's RPI seed remains required.

## Key findings

**What worked:**
- Browser-side iso-git operations are well inside the prior spike's stated budgets across both browsers tested.
- Steady-state commit latency is roughly equivalent between Node and Chromium (13–14ms p50). The 5–30× slowdown the pre-mortem narrative #1 assumed is **not present** in the lightning-fs path for the operations measured.
- `packObjects` runs faster in the browser than in the Node spike — probably an artifact of the Node spike's small-n p95 catching first-call setup, not a genuine browser advantage. Either way, push pre-wire cost is sub-50ms.
- The Buffer-polyfill issue (iso-git's UMD references `globalThis.Buffer`) is solved with a 67KB pre-bundled polyfill; one-time setup cost, no per-op penalty.

**What didn't / gotchas:**
- **Safari/WebKit not measured.** Playwright's WebKit binary won't launch on WSL2 (display/system-dep issues that fall outside the spike timebox). The Firefox numbers are not a substitute — Safari's IndexedDB implementation has historically been the slowest of the three, especially under load. This is the one remaining axis where the prior spike's failure threshold could realistically be approached.
- **Tested in foreground only.** Browsers aggressively throttle background-tab JS (Chromium throttles to 1Hz after 5 minutes); a workspace open in a background tab will be much slower for autosaves. Not a blocker but worth surfacing.
- **lightning-fs is IndexedDB-backed, not OPFS.** DD-009 mandates OPFS. Most evidence (sync I/O in workers, no transaction overhead) suggests OPFS will be similar-or-faster than these lightning-fs numbers, but that's an extrapolation, not a measurement.
- **The corpus build was suspiciously fast (92ms Chrome / 228ms Firefox for 45MB random + 150 files).** IndexedDB flushes lazily; the timer was almost certainly stopped before bytes hit the disk. This matters for the "saved" indicator UX narrative #4: an OPFS/IndexedDB "write completed" callback doesn't mean "persisted across crash." Already covered by the typed-error-union mitigation but worth re-naming.
- **20-sample p95 is small.** Same caveat as the prior spike; what we have is "median vs slowest of 20." For real p95 production telemetry will need ≥100 samples.

**Surprises:**
- Chromium's headroom against the budget is wider than expected (12× on commit p95, 4× on log).
- The first-spike pre-mortem narrative #1 ("browser-perf cliff") was over-calibrated; downgrading from Likely/High to Plausible/Medium based on Chromium + Firefox data (Safari still pending).
- iso-git's `index.umd.min.js` requires a `Buffer` global. This wasn't surfaced in the iso-git README's browser-quickstart and cost ~10 minutes of debug. Worth a CLAUDE.md / RPI-plan note.

## Recommendation

**Proceed to RPI as planned.** The Spike validation extension gate is cleared on Chromium and Firefox; flag Safari as a pre-launch verification step rather than a pre-RPI gate (the perf risk of Safari being 2-3× worse than Firefox is real but mitigable downstream). Adjust the pre-mortem narrative #1 plausibility/severity downward in the carried-forward seed.

## Updates to the prior spike's RPI seed

Three of the items in [the prior spike's RPI seed](isomorphic-git-perf-50mb.md#rpi-seed) need adjustment:

1. **Spike validation extension** is now **partially fulfilled** (Chromium + Firefox; Safari and OPFS-adapter remaining). Demote from "RPI gate" to "pre-launch verification gate."
2. **Failure narrative #1 (browser-perf cliff)** plausibility downgrade: **Likely / High → Plausible / Medium**, scoped to Safari + sustained-load + background-tab combinations. The default-tab Chromium+Firefox case is empirically clear.
3. **New invariant for the RPI plan**: iso-git's UMD build requires `globalThis.Buffer`; bundlers must include the `buffer` polyfill (`npm install buffer`, then either bundle as IIFE or use a build system that handles it automatically — Next.js does this via Webpack 5 polyfills config).

## Limitations (what this spike did NOT answer)

- **Safari/WebKit** behavior (the highest-leverage remaining unknown).
- **OPFS-backed FS adapter** vs IndexedDB-backed lightning-fs. DD-009 mandates OPFS; this measured the well-trodden but non-target stack. An OPFS adapter for iso-git exists in some forks but is not a first-party package.
- **Background-tab throttling.** Modern browsers throttle background-tab JS heavily; production autosave cadence may be affected.
- **Long-running session.** No measurements at the 1-hour or 4-hour mark; IndexedDB transaction logs may accumulate.
- **HTTP transport overhead** for real `clone`/`push` against GitHub/GitLab (still not measured).
- **Multi-tab contention** on the same workspace.
- **Mobile browsers** at all.

## Reproduction

Scripts live at `/tmp/iso-git-browser-spike/` on the spike branch — script source + run output preserved verbatim below.

```bash
cd /tmp/iso-git-browser-spike
npm install isomorphic-git @isomorphic-git/lightning-fs playwright buffer esbuild
npx playwright install chromium firefox
# bundle buffer polyfill as IIFE:
echo 'import { Buffer } from "buffer"; globalThis.Buffer = Buffer;' > buffer-shim.js
npx esbuild buffer-shim.js --bundle --format=iife --target=es2020 --outfile=buffer-global.js
node runner.mjs                       # ~10s total
```

## Raw output (verbatim)

```
Chromium: build 92ms, bootstrap 739ms, checkout 319ms, commit p50 14ms p95 17ms,
          log(filepath, 100-commit) 235ms, log(full, 121 commits) 40ms, pack 40ms (7KB, 50 commits)
Firefox:  build 228ms, bootstrap 1.10s, checkout 517ms, commit p50 19ms p95 35ms,
          log(filepath, 100-commit) 400ms, log(full, 121 commits) 64ms, pack 43ms (7KB, 50 commits)
```
