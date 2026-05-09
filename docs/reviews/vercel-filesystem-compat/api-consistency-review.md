# API Consistency Review

**Repository:** meta-formalism-copilot
**Branch:** `feat/vercel-filesystem-compat`
**Commit:** b64c1cade4a69a4a5154f6cd67aa30ce7cf8841b
**Scope:** `git diff origin/main...HEAD` (3 files changed)
**Reviewed:** 2026-04-27
**Fact-check input:** `docs/reviews/vercel-filesystem-compat/code-fact-check-report.md` (used)

Files in scope:

- `app/lib/utils/dataDir.ts` (new, 15 lines)
- `app/lib/llm/cache.ts` (1-line change, import + base path)
- `app/lib/analytics/persist.ts` (3-line change, import + base path + comment)

The reviewed change introduces `dataDir(...subpaths: string[]): string`, a small internal-module API that branches on `process.env.VERCEL` to return either `/tmp` or `<cwd>/data` (optionally joined with extra path segments). Two consumers (`persist.ts`, `cache.ts`) were updated. The Lean verifier (`verifier/server.ts`) is a separate Express service and is correctly out of scope.

---

## Baseline Conventions

Surveyed neighbors of the new helper:

**Internal module APIs in `app/lib/utils/`** (12 files):

- Naming is verb-led, lowerCamelCase: `triggerDownload`, `downloadTextFile`, `sanitizeFilename`, `parseLatexPropositions`, `gatherDependencyContext`, `topologicalSort`, `mergeStreamingPreview`, `throttle`, `stripCodeFences`, `loadWorkspace`, `saveWorkspace`. There are no `getX` accessors in this directory and no `XPath` / `XDir` helpers; the closest analog is none — `dataDir` establishes a new pattern.
- Modules co-locate their JSDoc on the exported function (e.g. `export.ts:6-7`). `dataDir.ts` follows that convention.
- Rest-parameter signatures are rare in the public utility surface. The only other rest-args utility-shaped function is `throttle.ts:4` (`<T extends (...args: Parameters<T>) => void>`), which is a generic higher-order helper, not a path builder. So there is no precedent in `app/lib/utils/` for the "base + `...subpaths`" shape.
- Path utilities elsewhere in the codebase use Node's `path.join` directly with literal segments at call sites (`persist.ts:9` `join(DATA_DIR, "analytics.jsonl")`, `cache.ts:41,67,78` `join(CACHE_DIR, ...)`, `verifier/server.ts:17` `path.join(LEAN_PROJECT_DIR, "Verify.lean")`). The codebase pattern is "compute the base directory once as a const, then `join` literal filenames at the call site."

**Server-side persistence consumers:**

- `app/lib/analytics/persist.ts` exports `appendAnalyticsEntry` / `readAnalyticsEntries` / `clearAnalyticsEntries`. Verb-led, plural noun. `mkdirSync(..., { recursive: true })` guard via `ensureDir()`.
- `app/lib/llm/cache.ts` exports `computeHash` / `getCachedResult` / `setCachedResult` / `removeCachedResult`. `mkdir(..., { recursive: true })` guard via `ensureCacheDir()`.
- Both compute a module-level `*_DIR` constant once at import time and reuse it.

**Environment-variable conventions:**

- All other env-var reads in the app are at module scope, with `??` defaults: `LEAN_VERIFIER_URL` (`route.ts:4`), `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `SIMULATE_STREAM_FROM_CACHE`. None branch implicitly on `VERCEL` today.
- Reading env vars inside a function body (rather than at module load) is novel here. `dataDir` is the first instance of late-bound env-var-driven path resolution.

**Disk-write consumers in this repo (Next.js app only, excluding the verifier service):**

```
app/lib/llm/cache.ts          (updated in this PR)
app/lib/analytics/persist.ts  (updated in this PR)
```

`grep -rn "writeFile|appendFile|mkdir.*Sync"` across `app/` returns only those two files. **The `dataDir()` abstraction covers 100% of in-app disk-write consumers.** The Lean verifier server (`verifier/server.ts:103`, `writeFile(VERIFY_FILE, ...)`) is a separate Express process whose deploy target is a Lean-capable host, not a Vercel Function — it is correctly out of scope. No scripts in `scripts/` write to disk.

---

## Findings

### 1. `dataDir` reads `process.env.VERCEL` per call rather than at module load — divergent from existing env-var convention

**Severity:** Inconsistent
**Location:** `app/lib/utils/dataDir.ts:12-14`
**Move:** #1 (baseline conventions) + #2 (naming/shape against the grain)
**Confidence:** Medium

Every other env-var consumer in `app/` resolves the value once at module scope:

```ts
// app/api/verification/lean/route.ts:3-4
const LEAN_VERIFIER_URL = process.env.LEAN_VERIFIER_URL ?? "http://localhost:3100";

// app/lib/llm/callLlm.ts:112
const anthropicKey = process.env.ANTHROPIC_API_KEY;
```

`dataDir()` reads `process.env.VERCEL` on every invocation. In practice that's fine — both consumers call it once at module load and cache the result in a `const` — but the helper *signature* invites repeated calls (e.g. `dataDir("foo")`, `dataDir("bar")`), each of which re-evaluates the branch. This is a minor performance non-issue (one env lookup + one ternary), but the bigger consequence is consumer mental model: a function returning a different value depending on hidden global state, called multiple times in a hot path, is harder to reason about than a `const`.

The cache module already does this correctly (`const CACHE_DIR = dataDir("cache")` once, then `join(CACHE_DIR, ...)` at call sites — `cache.ts:7,41,67,78`). The helper API just doesn't enforce that pattern.

**Recommendation:** Either (a) keep the function but document "compute once at module load and cache" in the JSDoc, or (b) restructure as a constant: `export const DATA_DIR = process.env.VERCEL ? "/tmp" : join(process.cwd(), "data")` and let consumers use `join(DATA_DIR, ...)` directly. Option (b) matches the existing codebase pattern more closely (`LEAN_PROJECT_DIR`, `LEAN_VERIFIER_URL`, `DATA_DIR`, `CACHE_DIR` are all module-scope consts) and removes the rest-args sugar that has no precedent in `app/lib/utils/`.

---

### 2. Rest-args path-builder shape has no precedent in the codebase

**Severity:** Minor
**Location:** `app/lib/utils/dataDir.ts:12`
**Move:** #2 (naming against the grain), #7 (asymmetry)
**Confidence:** Medium

The signature `dataDir(...subpaths: string[]): string` is asymmetric with how the rest of the codebase composes paths. Existing pattern (3 sites):

```ts
const DATA_DIR = join(process.cwd(), "data");
const FILE_PATH = join(DATA_DIR, "analytics.jsonl");          // persist.ts:9 (pre-PR)

const CACHE_DIR = join(process.cwd(), "data", "cache");
const filePath = join(CACHE_DIR, `${hash}.json`);             // cache.ts:41 (pre-PR)

const LEAN_PROJECT_DIR = path.resolve(__dirname, "../../lean-project");
const VERIFY_FILE = path.join(LEAN_PROJECT_DIR, "Verify.lean"); // verifier/server.ts:17
```

The convention is "module-scope base const + `join` at the use site." `dataDir("cache")` collapses two of those steps into one but only for cache — `persist.ts` still does `dataDir()` then `join(DATA_DIR, "analytics.jsonl")`, so the codebase now has *two* path-composition idioms: rest-args (`cache.ts`) and `join` chaining (`persist.ts`). This is a small thing, but it's the kind of inconsistency that compounds: the next consumer added has to choose between two ways to do the same thing.

The function body itself is also slightly awkward — `subpaths.length > 0 ? join(base, ...subpaths) : base` is needed only because `join("/tmp")` is correct but `join("/tmp")` with no extra args is fine, so the guard is actually unnecessary; `join(base, ...subpaths)` works for `subpaths = []` (returns `base`).

**Recommendation:** Either (a) drop the rest-args sugar and make consumers do `join(DATA_DIR, "...")` consistently (matches the 3 existing baseline sites), or (b) commit to rest-args and update `persist.ts:8-9` to `const FILE_PATH = dataDir("analytics.jsonl")` so the two consumers use the helper the same way. Also: the `subpaths.length > 0` guard is dead code — `join(base)` with no extra args returns `base` unchanged. (Verified: `path.join("/tmp")` → `"/tmp"`.)

---

### 3. Naming: `dataDir` reads as a noun, but the function is verb-shaped

**Severity:** Minor
**Location:** `app/lib/utils/dataDir.ts:12`
**Move:** #2 (naming against the grain)
**Confidence:** Low

Existing utilities in `app/lib/utils/` are verb-led when they perform an action: `triggerDownload`, `downloadTextFile`, `sanitizeFilename`, `parseLatexPropositions`, `gatherDependencyContext`, `topologicalSort`, `mergeStreamingPreview`, `stripCodeFences`, `loadWorkspace`, `saveWorkspace`. There are no noun-named functions in this directory. The closest analogs in the broader Node ecosystem are `os.tmpdir()` and `process.cwd()` — both noun-named, both functions, so the noun-as-function shape is not without precedent. But within *this* codebase the convention is verb-led.

The user's prompt suggested `getStorageDir` or `persistencePath` as alternatives. `getStorageDir` matches the verb-led convention and reads more clearly as "this is a function call, it returns a path." `persistencePath` is also fine but is noun-shaped.

This is the lowest-severity finding because the consumer impact is near-zero — `dataDir("cache")` reads naturally enough — but if the codebase has consistent verb-led utility naming, this is a small departure.

**Recommendation:** Consider `getDataDir`, `getStorageDir`, or `resolveDataDir`. Not blocking; this is a "while you're touching it" suggestion. If kept as `dataDir`, no action needed — it's understandable as-is.

---

### 4. Comment cross-reference points at a non-existent README section (carried from fact-check)

**Severity:** Minor (documentation)
**Location:** `app/lib/analytics/persist.ts:6-7`
**Move:** #3 (consumer contract: documentation drift)
**Confidence:** High

The fact-check report (Claim 5) found that the comment "see Deploy to Vercel in README" references a section that does not exist in `README.md`. From a consistency perspective: the cache module's analogous comment situation is handled differently — `cache.ts` has *no* user-facing comment about Vercel behavior, just the module-scope `dataDir("cache")` call. So the two consumers document the Vercel caveat asymmetrically (one has a stale README pointer, the other has nothing).

**Recommendation:** Either add the "Deploy to Vercel" section to `README.md` in this PR (the change is small enough that adding a 2-paragraph note alongside is cheap), or drop the README pointer from `persist.ts:6-7` and rely on `dataDir()`'s JSDoc as the single source of truth. Pick one and apply consistently — if the README section gets added, `cache.ts` should also get a comment pointing at it for symmetry.

---

### 5. JSDoc omits the per-instance / multi-instance caveat (carried from fact-check)

**Severity:** Informational
**Location:** `app/lib/utils/dataDir.ts:7-9`
**Move:** #3 (consumer contract: docs vs behavior)
**Confidence:** High

The fact-check report (Claim 2) flagged this. From an API-consistency angle: future consumers of `dataDir()` reading the JSDoc will assume "writes accumulate within a warm container," but on Vercel they actually accumulate *per instance*. For analytics this matters (concurrent invocations write divergent JSONL files); for the cache it bounds hit-rate. Both consumers depend on a property the JSDoc does not document.

**Recommendation:** Tighten the JSDoc to include the per-instance caveat, e.g. "...does not survive cold starts, and `/tmp` is per-instance — concurrent Function instances do not share state." This is the single source of truth the comment in `persist.ts:6-7` defers to, so it should fully describe the constraint.

---

## What Looks Good

- **Disk-write consumer coverage is complete.** `grep` across `app/` for `writeFile|appendFile|mkdir.*Sync` returns exactly the two files updated in this PR. No production-code consumer was missed. (The Lean verifier `writeFile` at `verifier/server.ts:103` is a separate Express service deployed separately and correctly out of scope.)
- **Backward-compatible internal API.** `dataDir()` (no args) returns the same shape as the previous `join(process.cwd(), "data")` literal, and both consumers' downstream `join(DATA_DIR, "...")` calls continue to work. There is no breaking change for any caller.
- **Server-side scoping respected.** `dataDir.ts` does not import any client-only modules and is only imported by server-side modules (`persist.ts` is consumed by `app/api/analytics/route.ts`; `cache.ts` is consumed by `callLlm.ts`/`streamLlm.ts`). It will not accidentally be bundled into a client component.
- **Dev/self-hosted behavior preserved.** With `process.env.VERCEL` unset, the resolved paths are byte-identical to pre-PR behavior, so existing `data/cache/` and `data/analytics.jsonl` files continue to work unmodified.
- **JSDoc explains the "why."** The block comment in `dataDir.ts:3-11` correctly motivates the branch — important for a helper whose body is a one-liner that wouldn't otherwise justify its own file.

---

## Summary Table

| # | Finding                                                                | Severity      | Location                          | Confidence |
|---|------------------------------------------------------------------------|---------------|-----------------------------------|------------|
| 1 | Per-call env read diverges from module-scope env convention            | Inconsistent  | `app/lib/utils/dataDir.ts:12-14`  | Medium     |
| 2 | Rest-args path-builder shape has no precedent; consumers use it inconsistently (cache uses rest-args, persist uses join chain); guard is dead code | Minor         | `app/lib/utils/dataDir.ts:12`     | Medium     |
| 3 | Noun-shaped name diverges from verb-led utility convention             | Minor         | `app/lib/utils/dataDir.ts:12`     | Low        |
| 4 | README cross-reference points at non-existent section; cache has no analogous comment (asymmetry) | Minor         | `app/lib/analytics/persist.ts:6-7`| High       |
| 5 | JSDoc omits per-instance multi-Function caveat                         | Informational | `app/lib/utils/dataDir.ts:7-9`    | High       |

---

## Overall Assessment

The change is small, behaviorally correct, and complete in its disk-writer coverage — the two findings the user explicitly asked to verify (other consumers missed, naming convention, signature shape) come out as: (a) **no consumer is missed**; (b) the **naming and signature shape are mildly inconsistent with the codebase's existing pattern of "module-scope base const + `join` at call site,"** but the deviation is small and doesn't break consumer code.

The most actionable finding is #2: the helper introduces a rest-args path-composition idiom that exists nowhere else, and the two consumers in this PR already use it inconsistently (`cache.ts` calls `dataDir("cache")`; `persist.ts` calls `dataDir()` then `join`s). Picking one idiom and applying it to both consumers (or, simpler, dropping the rest-args and exporting `DATA_DIR` as a constant matching `LEAN_PROJECT_DIR` / `LEAN_VERIFIER_URL` / etc.) would remove the inconsistency at low cost. Findings #4 and #5 are documentation tightening carried from the fact-check.

No breaking changes. No missed consumers. No security or performance concerns. The PR is mergeable as-is; the findings above are all "while you're here" tightening, not blockers.
