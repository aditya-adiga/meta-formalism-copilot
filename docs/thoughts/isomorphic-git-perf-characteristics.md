# `isomorphic-git` perf characteristics (Node baseline + browser smoke)

Last verified: 2026-06-01
Relevant paths: docs/decisions/009-artifact-corpus-architecture.md · docs/spikes/isomorphic-git-perf-50mb.md · docs/spikes/iso-git-browser-smoke.md
Source: spikes `spike/isomorphic-git-perf-50mb-2026-06-01` (Node) and `spike/iso-git-browser-smoke-2026-06-01` (browser)

Brief, lasting notes from the DD-009 perf spikes, separated from the spike records so future sessions can find them without grepping spikes/.

## Side-by-side: Node `fs` vs lightning-fs in real browsers

`isomorphic-git@1.38.3` + `@isomorphic-git/lightning-fs@4.6.2` on a 50MB DD-009-shaped corpus:

| Operation | Node `fs` | Chromium | Firefox | Chrome / Node ratio |
|---|---|---|---|---|
| Checkout post-pack | 258ms | 319ms | 517ms | 1.2× |
| Commit p50 (20 samples) | 13ms | 14ms | 19ms | 1.1× |
| Commit p95 (20 samples) | 116ms (max-of-n) | 17ms | 35ms | 0.15× (Node looks worse here — small-n artifact) |
| `log({filepath})` over 100-commit history | ~139ms (extrap) | 235ms | 400ms | 1.7× |
| packObjects (50 commits) | 158ms | 40ms | 43ms | 0.25× |
| Corpus build (45MB random + 150 small files → FS) | ~50ms (sync) | 92ms | 228ms | 1.8× |

**The browser-side ratio is ~1–2× of Node, not 5–30×.** The pre-mortem narrative #1 in the first spike was over-pessimistic about the browser slowdown. Three caveats:
- **Safari/WebKit untested** — Playwright's WebKit binary doesn't run reliably on WSL2; deferring to a macOS run.
- **lightning-fs is IndexedDB-backed, not OPFS.** DD-009's target is OPFS; expected to be similar-or-faster than these numbers.
- **Foreground tab only.** Background-tab JS is throttled to ~1Hz after 5 minutes in Chrome — autosave cadence in a backgrounded workspace will be much worse than these measurements.

## Node-side scaling (the upper-bound table)

On Node 22 `fs`:
- `checkout` of a fresh `.git` into a 50MB working tree: ~258ms; into 100MB: ~475ms
- `commit` (small artifact added to existing tree): p50 13ms regardless of tree size
- `git.log({ filepath })` over a 200-commit per-file history: 278ms (near-linear in commit count)
- `packObjects` for a 21-commit pack: 158ms

## The scaling cliff to watch

`git.log({ filepath })` scales near-linearly with the number of commits that touched the file. The 50MB and 100MB Node spike runs hide this because everything was created in one bootstrap commit; the follow-up Node 200-commit run and the browser 100-commit run confirm it. The F6 worst case (DD-009 §Revisit triggers ">1000 versions in 3 months") materializes here:

| Per-file commits | Node | Chromium (measured/extrap) | Firefox (measured/extrap) |
|---|---|---|---|
| 100 | ~139ms | 235ms (measured) | 400ms (measured) |
| 200 | 278ms (measured) | ~470ms | ~800ms |
| 1000 | ~1.4s | ~2.4s | ~4s |
| 3000 | ~4.2s | ~7s | ~12s |

Any UI that calls `git.log({ filepath })` eagerly without pagination will hang for power users. Use `depth` + cursor-based pagination. The cliff arrives sooner on Firefox than Chrome.

## Other gotchas to remember

- **iso-git's UMD build requires `globalThis.Buffer`.** Not surfaced in the iso-git README's browser-quickstart. Browser bundlers must include the `buffer` polyfill; Next.js handles this via Webpack 5's `fallback` config but it isn't on by default.
- **IndexedDB write completion ≠ disk persistence.** The 45MB corpus build returned 92ms on Chrome; that's the IndexedDB transaction commit, not the bytes-on-disk fsync. Real durability happens on the browser's flush schedule.
- **First-call setup amortizes large amounts of latency.** Both Node and browser runs show the first commit paying many ms of setup that subsequent commits don't. 20-sample p95 catches this; 100+ sample p95 doesn't.

## What's still not measured

- Safari/WebKit at all (the highest-leverage remaining unknown).
- An OPFS-backed FS adapter (vs lightning-fs IndexedDB; OPFS is DD-009's mandated target).
- Background-tab throttling on autosave cadence.
- Long-running session memory (Node RSS stayed at ~340MB after the 100MB run — informational; browser equivalent over hours is not known).
- HTTP transport overhead for real `clone`/`push`.
- Multi-tab contention on the same workspace.
- Mobile browsers at all.
