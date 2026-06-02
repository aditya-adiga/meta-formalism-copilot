# `isomorphic-git` perf characteristics (Node baseline)

Last verified: 2026-06-01
Relevant paths: docs/decisions/009-artifact-corpus-architecture.md · docs/spikes/isomorphic-git-perf-50mb.md
Source: spike `spike/isomorphic-git-perf-50mb-2026-06-01`

Brief, lasting notes from the DD-009 perf spike, separated from the spike record so future sessions can find them without grepping spikes/.

## Node-side scaling (50–100MB workspaces)

On `isomorphic-git@1.38.3` against Node 22 `fs`:
- `checkout` of a fresh `.git` into a 50MB working tree: ~258ms
- `checkout` of a fresh `.git` into a 100MB working tree: ~475ms
- `commit` (single small artifact file added to existing tree): p50 13ms regardless of tree size (50MB or 100MB)
- `git.log({ filepath })` over a 200-commit per-file history: 278ms (near-linear in commit count)
- `packObjects` for a 21-commit pack: 158ms

## The thing to remember for the browser-port

These numbers are an **upper bound** on what the browser will deliver. Node has hardware SHA1/zlib and faster syscalls. Browser WASM SHA1 is 5–30× slower; OPFS sync I/O has worse tail latency than `fs`. Plan for at least 5–10× slowdown on commit p50 and 3× on log when porting estimates to the browser. Safari and Firefox OPFS implementations are newer than Chrome's and have larger tails.

## The scaling cliff to watch

`git.log({ filepath })` scales near-linearly with the number of commits that touched the file. The 50MB and 100MB spike runs hide this because everything was created in one bootstrap commit. The real F6 worst case is a power user with thousands of versions of a single artifact, which is the exact scenario DD-009 §Revisit triggers names (">1000 versions in 3 months"). Extrapolated:

| Commits per file | Node-side log time | Likely browser-side |
|---|---|---|
| 200 | 278ms | ~0.8–2.7s |
| 1000 | ~1.4s | ~4–14s |
| 3000 | ~4.2s | ~12–40s |

Implications: any UI that calls `git.log({ filepath })` eagerly without pagination will hang for power users. Use `depth` + cursor-based pagination.

## What's not in the Node measurement

- Browser OPFS performance (the thing that actually ships)
- HTTP transport overhead for real `clone`/`push`
- Simultaneous-tab contention
- Memory behavior in a long-running browser tab (Node RSS stayed sticky at ~340MB after 100MB run — informational, not a blocker, but watch in browser)
