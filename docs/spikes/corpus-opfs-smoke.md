# Corpus OPFS browser smoke (DD-009 S1) — out-of-CI, pre-merge gate

Date: 2026-06-01
Relevant paths: app/lib/corpus/opfsAdapter.ts, app/lib/corpus/__tests__/corpusFsContract.ts

jsdom has no OPFS, so the OPFS adapter's *success* path can't run in the Vitest suite — CI only exercises the in-memory fake and the adapter's error-mapping. This smoke runs the adapter against **real** OPFS in Chromium + Firefox. It is the deferred half of DD-009's spike-validation extension for the adapter (the perf spikes measured lightning-fs/IndexedDB, not this OPFS adapter).

**Status:** manual, pre-merge before the corpus flag is ever defaulted on. Not wired into CI (would need a Playwright browser env and a bundling step the unit suite doesn't have). Safari/WebKit remains a pre-launch item (Playwright WebKit doesn't run on WSL2 — see docs/spikes/iso-git-browser-smoke.md).

## What to verify

Run the shared `CorpusFS` contract behaviors against `createOpfsCorpusFs()` in a real page:
1. `readFile`/`stat` of a missing path → `null`; `readdir` of a missing dir → `[]`.
2. Byte round-trip of all 256 byte values (no UTF-8 mangling).
3. Nested-path create + `readdir` at each level.
4. The S4 access pattern: write 30 small `v####.md` files under one dir, `readdir` → 30, read each back.
5. `rm` removes a file and is idempotent on a missing path.
6. Quota: optionally fill OPFS until a write rejects with `{kind:"quota-exceeded"}` (slow; optional).

## How to run (sketch — mirrors the iso-git spike harness)

```bash
# from a throwaway dir; bundle the adapter for the browser, then drive it with Playwright
npx esbuild app/lib/corpus/opfsAdapter.ts app/lib/corpus/types.ts \
  --bundle --format=esm --outfile=/tmp/corpus-smoke/opfsAdapter.js
# serve a tiny page that imports the bundle and exposes createOpfsCorpusFs() on window,
# then in a Playwright script: page.evaluate(async () => { /* run the 6 checks above */ })
npx playwright install chromium firefox
node /tmp/corpus-smoke/runner.mjs   # asserts the 6 behaviors, prints per-op result
```

Gate criterion: all 6 behaviors pass on Chromium and Firefox. If any fails, fix the adapter before the flag is enabled for anything beyond local dev.

## Results

_(not yet run — fill in when executed before enabling the flag in a shared environment)_
