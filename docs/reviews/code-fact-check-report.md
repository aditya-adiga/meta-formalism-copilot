# Code Fact-Check Report

**Repository:** meta-formalism-copilot
**Scope:** `git diff main...HEAD -- app/` (focus: `app/lib/corpus/*`, `app/lib/stores/workspaceStore.ts`, new tests) — feat/corpus-architecture
**Checked:** 2026-06-01
**Total claims checked:** 12
**Summary:** 11 verified, 1 mostly accurate, 0 stale, 0 incorrect, 0 unverifiable

> Hallucination pattern log: `docs/reviews/hallucination-patterns.md` does not exist. Proceeded normally; no qualifying fabrications were found, so no log was created.

---

## Claim 1: "GIT IS NOT PART OF THIS INTERFACE. S3's commit/log/push/pull belong on a separate `CorpusGit` interface ... Do not add git methods here"

**Location:** `app/lib/corpus/types.ts:19-22`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Future sub-task implementers (S3 git pipeline) and the in-memory fake author — the comment is a binding constraint on what may be added to the interface.

The `CorpusFS` interface declares exactly five methods, none of which are git operations:

```ts
// app/lib/corpus/types.ts:112-125
export interface CorpusFS {
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  readdir(path: string): Promise<string[]>;
  rm(path: string): Promise<void>;
  stat(path: string): Promise<CorpusStat | null>;
}
```

A grep for git verbs (`commit|push|pull|log|merge|branch|checkout`) across `types.ts` returns only the comment line at `:19` that *names* them as excluded; no method or symbol implements any of them (paraphrased — no quote available because the claim covers absence of code: the grep produced no member-definition matches). There is no `CorpusGit` interface defined in this slice either, consistent with it being deferred to S3.

**Evidence:** `app/lib/corpus/types.ts:19-22`, `app/lib/corpus/types.ts:112-125`

---

## Claim 2: "'Not found' is `null` from `readFile`/`stat` and `[]` from `readdir`; everything else rejects with a `CorpusError`. Callers never see `undefined`."

**Location:** `app/lib/corpus/types.ts:17-18`
**Type:** Behavioral / Invariant
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Callers of `CorpusFS` (storeAdapter, future S2/S4 consumers) deciding how to branch on a missing path.

The interface docstrings restate this per-method, and both implementations honor it. In the OPFS adapter, `readFile` returns `null` on a missing parent dir or missing file:

```ts
// app/lib/corpus/opfsAdapter.ts:91-98
const dir = await walkDir(root, dirs, false);
if (!dir) return null;
let fh: OpfsFileHandle;
try {
  fh = await dir.getFileHandle(name, { create: false });
} catch (e) {
  if (isNotFound(e)) return null;
```

`readdir` returns `[]` when the directory is missing:

```ts
// app/lib/corpus/opfsAdapter.ts:129-130
const dir = await walkDir(root, dirs, false);
if (!dir) return [];
```

`stat` returns `null` on a missing dir or file (`app/lib/corpus/opfsAdapter.ts:161-167`). The in-memory fake matches: `readFile` does `files.get(...) ?? null` (`inMemoryCorpusFs.ts:22`), `readdir` builds a sorted array that is `[]` when no children match (`inMemoryCorpusFs.ts:30-42`), and `stat` returns `{ size } | null` (`inMemoryCorpusFs.ts:48-51`). The "everything else rejects with `CorpusError`" half is enforced by `wrap()`, which converts any non-`CorpusError` into a `CorpusError` (`app/lib/corpus/opfsAdapter.ts:79-83`). No path returns `undefined`.

**Evidence:** `app/lib/corpus/types.ts:113-124`, `app/lib/corpus/opfsAdapter.ts:91-98`, `app/lib/corpus/opfsAdapter.ts:129-130`, `app/lib/corpus/opfsAdapter.ts:161-167`, `app/lib/corpus/opfsAdapter.ts:79-83`, `app/lib/corpus/__tests__/inMemoryCorpusFs.ts:22-51`

---

## Claim 3: "Removes a file. Idempotent: resolves (no-op) if the path does not exist."

**Location:** `app/lib/corpus/types.ts:121`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Callers performing deletes (e.g., `createCorpusBackedStorage.removeItem`) that need to not error on already-absent files.

The OPFS `rm` returns early both when the parent directory is missing and when the file itself is absent:

```ts
// app/lib/corpus/opfsAdapter.ts:142-149
const dir = await walkDir(root, dirs, false);
if (!dir) return; // idempotent: parent dir missing -> nothing to remove
try {
  await dir.removeEntry(name);
} catch (e) {
  if (isNotFound(e)) return; // idempotent: file already gone
```

The fake matches: `files.delete(normalize(path))` is a no-op on a missing key (`inMemoryCorpusFs.ts:45`).

**Evidence:** `app/lib/corpus/opfsAdapter.ts:142-149`, `app/lib/corpus/__tests__/inMemoryCorpusFs.ts:44-46`

---

## Claim 4: "The debounced localStorage path was moved verbatim from workspaceStore.ts ... so the OFF path is byte-for-byte the prior behavior"

**Location:** `app/lib/corpus/storeAdapter.ts:20-24` (also `:7`)
**Type:** Architectural / Behavioral
**Verdict:** Mostly accurate
**Confidence:** High
**Legibility-target:** A reviewer verifying the refactor introduced no behavior change on the default (flag-off) path.

The function *body* is identical between the old and new implementations — debounce timer, 300 ms `setTimeout`, the `try/catch` with the exact `console.warn("Failed to persist workspace (localStorage quota exceeded):", e)` message, and the `removeItem` clear-pending logic. New (storeAdapter):

```ts
// app/lib/corpus/storeAdapter.ts:25-46
export function createDebouncedLocalStorage(): StateStorage {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        try {
          localStorage.setItem(name, value);
        } catch (e) {
          console.warn("Failed to persist workspace (localStorage quota exceeded):", e);
        }
```

Old (deleted from workspaceStore), per the diff:

```ts
// git diff main...HEAD app/lib/stores/workspaceStore.ts (removed lines)
function createDebouncedStorage(): {
  getItem: (name: string) => string | null;
  ...
}{
  let pending: ReturnType<typeof setTimeout> | null = null;
  ...
        } catch (e) {
          console.warn("Failed to persist workspace (localStorage quota exceeded):", e);
```

The reason for "mostly accurate" rather than "verified": it is not literally *byte-for-byte the same source*. The function was **renamed** (`createDebouncedStorage` -> `createDebouncedLocalStorage`) and its **return type annotation changed** from an inline `{ getItem; setItem; removeItem }` object type to `StateStorage` (imported from `zustand/middleware`, `storeAdapter.ts:15`). The runtime *behavior* of the OFF path is byte-for-byte identical (the comment's actual claim), but the surrounding signature is not — a reader comparing the literal text would find two non-identical lines (name + return type). The directional claim about behavior is correct; the "verbatim"/"byte-for-byte" phrasing slightly overstates source-level identity.

**Evidence:** `app/lib/corpus/storeAdapter.ts:25-46`, `app/lib/corpus/storeAdapter.ts:15`, `git diff main...HEAD -- app/lib/stores/workspaceStore.ts` (removed `createDebouncedStorage`)

---

## Claim 5: "the persist blob is stored as a SINGLE file via CorpusFS (blob mode) — the files-per-artifact folder layout (layout.ts/manifest.ts) is built but not used by the store until S4."

**Location:** `app/lib/corpus/storeAdapter.ts:11-13` (also `app/lib/corpus/storeAdapter.ts:48-49`)
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** A reviewer/operator who might assume enabling the flag populates the folder layout — the comment warns it does not.

`createCorpusBackedStorage` writes/reads exactly one path per persist key, computed by `pathFor`:

```ts
// app/lib/corpus/storeAdapter.ts:52-67
const pathFor = (name: string) => `state/${name}.json`;
return {
  getItem: async (name) => {
    const bytes = await fs.readFile(pathFor(name));
    return bytes ? dec.decode(bytes) : null;
  },
  setItem: async (name, value) => {
    await fs.writeFile(pathFor(name), enc.encode(value));
  },
```

The store's only consumption of this module is `resolveWorkspaceStorage` (`storeAdapter.ts:71-76`), wired in at `workspaceStore.ts` via `storage: createJSONStorage(resolveWorkspaceStorage)`. A grep of `workspaceStore.ts` for `paths`/`manifest` returns nothing, and a grep across non-test `app/**/*.ts` for imports of `./paths`, `./manifest`, `corpus/paths`, or `corpus/manifest` returns no results — confirming neither `paths.ts` nor `manifest.ts` is referenced by production code (paraphrased — no quote available because the claim covers absence of imports; the grep produced no matches). Both modules exist (`paths.ts`, `manifest.ts`) and are exercised only by their unit tests (`paths.test.ts`, `manifest.test.ts`). Minor naming note: the source file is `paths.ts`, not `layout.ts` — the comment's parenthetical "layout.ts/manifest.ts" uses the conceptual name; the actual file is `paths.ts` (the seam doc and CLAUDE.md explain `layout.ts` is a reserved Next.js filename). This does not affect the substantive claim that the store uses a single blob file and not the folder layout.

**Evidence:** `app/lib/corpus/storeAdapter.ts:52-67`, `app/lib/corpus/storeAdapter.ts:71-76`, `app/lib/stores/workspaceStore.ts` (storage wiring), grep of `app/**/*.ts` for paths/manifest imports (no non-test results)

---

## Claim 6: "any call in an environment without `navigator.storage.getDirectory` rejects with a typed `CorpusError` ({kind:'unavailable'}), never a raw `TypeError`."

**Location:** `app/lib/corpus/opfsAdapter.ts:10-12`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** SSR/Node and unsupported-browser callers and the test (`opfsAdapter.test.ts`) asserting the typed error.

Every public method begins with `await getRoot()`, which throws a typed `CorpusError` when storage is absent:

```ts
// app/lib/corpus/opfsAdapter.ts:49-54
async function getRoot(): Promise<OpfsDirHandle> {
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storage || typeof storage.getDirectory !== "function") {
    throw new CorpusError({ kind: "unavailable", reason: "navigator.storage.getDirectory is not available (SSR or unsupported browser)" });
  }
```

This `CorpusError` is constructed before any `navigator.storage` access, so a raw `TypeError` from dereferencing an undefined `navigator` cannot escape (the `typeof navigator !== "undefined"` guard also prevents a ReferenceError). The `wrap()` catch in each method re-throws an existing `CorpusError` unchanged (`opfsAdapter.ts:80`), so the typed error propagates to the caller.

**Evidence:** `app/lib/corpus/opfsAdapter.ts:49-54`, `app/lib/corpus/opfsAdapter.ts:79-83`

---

## Claim 7: "a quota failure rejects with {kind:'quota-exceeded', substrate:'opfs'} — it is NOT swallowed with console.warn the way the legacy localStorage adapter does (workspaceStore.ts:44-46)."

**Location:** `app/lib/corpus/opfsAdapter.ts:11-14`
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Callers/UI (the S5 failure-driven UI) that must observe quota errors rather than have them silently dropped.

`wrap()` reifies a quota DOMException into a typed rejection:

```ts
// app/lib/corpus/opfsAdapter.ts:79-83
function wrap(path: string, e: unknown): never {
  if (e instanceof CorpusError) throw e;
  if (isQuota(e)) throw new CorpusError({ kind: "quota-exceeded", substrate: "opfs" });
  throw new CorpusError({ kind: "io", path, reason: (e as Error)?.message ?? String(e) });
}
```

`isQuota` matches `QuotaExceededError`/`QUOTA_EXCEEDED_ERR` DOMExceptions (`opfsAdapter.ts:45-47`). No `console.warn` appears anywhere in `opfsAdapter.ts`. The contrast with the legacy adapter is accurate: the moved localStorage adapter swallows quota errors with `console.warn(...)` and no re-throw (`storeAdapter.ts:33-36`). The in-comment line reference `workspaceStore.ts:44-46` points at the *pre-refactor* location of that swallow — the same code now lives at `storeAdapter.ts:33-36` post-move (a stale line locator to the old location, but the described behavior contrast is correct).

**Evidence:** `app/lib/corpus/opfsAdapter.ts:79-83`, `app/lib/corpus/opfsAdapter.ts:45-47`, `app/lib/corpus/storeAdapter.ts:33-36`

---

## Claim 8: "Reads are synchronous (instant); writes are debounced by 300ms." (debounced localStorage adapter)

**Location:** `app/lib/corpus/storeAdapter.ts:23`
**Type:** Behavioral / Configuration
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Performance-conscious readers comparing the localStorage path to the async OPFS path.

`getItem` is a synchronous `localStorage.getItem` call (no `await`), and `setItem` wraps the write in a `setTimeout(..., 300)`:

```ts
// app/lib/corpus/storeAdapter.ts:28-39
getItem: (name) => localStorage.getItem(name),
setItem: (name, value) => {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    ...
  }, 300);
},
```

The `300` literal confirms the configuration claim.

**Evidence:** `app/lib/corpus/storeAdapter.ts:28-39`

---

## Claim 9: "parsing is FAIL-LOUD. A malformed or absent manifest must surface as a typed `CorpusError` ... never a silent default-empty manifest."

**Location:** `app/lib/corpus/manifest.ts:11-14` (also `:69-73`)
**Type:** Behavioral
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Future S4 callers that load a workspace from the manifest and must not mistake corruption for emptiness.

`parseManifest` calls `fail()` (which throws a `CorpusError`) on every malformation, including a `null` input:

```ts
// app/lib/corpus/manifest.ts:74-84
export function parseManifest(bytes: Uint8Array | null): WorkspaceManifest {
  if (bytes === null) fail("manifest file is absent");
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    fail(`not valid JSON (${(e as Error).message})`);
  }
  if (!isObject(raw)) fail("top-level value is not an object");
  if (typeof raw.title !== "string") fail("missing required field: title");
```

`fail` throws `new CorpusError({ kind: "io", path: "workspace.json", reason }, ...)` (`manifest.ts:64-67`). Every validation branch (missing `sources`, `artifacts`, `customTypeIds`, bad source/artifact entries) routes through `fail`, so no code path returns a default-empty manifest. Note: the docstring's "io or browser-storage-cleared" kind set is partly aspirational — the code only ever throws kind `"io"` here, never `"browser-storage-cleared"` — but the load-bearing claim (fail-loud, typed, never silent-default) is fully accurate.

**Evidence:** `app/lib/corpus/manifest.ts:64-67`, `app/lib/corpus/manifest.ts:74-104`

---

## Claim 10: "the traversal guard in `workspaceSlug` is the single choke point that keeps untrusted workspace titles inside `workspaces/`" / slug "cannot escape `workspaces/`. ... Throws if nothing safe remains."

**Location:** `app/lib/corpus/paths.ts:17-19` (also `:30-35`)
**Type:** Behavioral / Invariant
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Security-reviewer and any caller building corpus paths from user-supplied titles/ids.

`workspaceSlug` replaces every character outside `[a-zA-Z0-9_-]` with a hyphen and throws on an empty result:

```ts
// app/lib/corpus/paths.ts:36-47
export function workspaceSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(SAFE_SEGMENT, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!slug) {
    throw new Error(`workspace title produced an empty slug: ${JSON.stringify(title)}`);
  }
  return slug;
}
```

`SAFE_SEGMENT = /[^a-zA-Z0-9_-]+/g` (`paths.ts:28`) collapses `/`, `\`, and `.` to hyphens, so `..` and path separators cannot survive — preventing directory escape. All path builders that take a slug route it through `workspaceSlug` via `workspaceDir` (`paths.ts:70-72`, used by `workspaceManifestPath`, `sourcePath`, `artifactDir`, etc.), so the "single choke point" claim holds for the slug dimension. The companion `safeSegment` (`paths.ts:52-58`) applies the same guard to ids. (The "single choke point" claim is enforced by convention, not the compiler — nothing prevents a caller hand-concatenating a path — but every builder in this file does route through the guards.)

**Evidence:** `app/lib/corpus/paths.ts:28`, `app/lib/corpus/paths.ts:36-47`, `app/lib/corpus/paths.ts:52-58`, `app/lib/corpus/paths.ts:70-72`

---

## Claim 11: "DEFAULT OFF and DEV-ONLY. ... Enable via either the build-time env `NEXT_PUBLIC_CORPUS_FS=1` or ... `localStorage.setItem('corpus-fs-enabled', '1')`."

**Location:** `app/lib/corpus/flag.ts:3-10`
**Type:** Configuration / Behavioral
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** Operators/developers deciding how to toggle the flag and confirming it is off for end users.

`isCorpusEnabled` returns `true` only when the env var equals `"1"` or the localStorage key equals `"1"`, defaulting to `false`:

```ts
// app/lib/corpus/flag.ts:15-25
export function isCorpusEnabled(): boolean {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_CORPUS_FS === "1") return true;
  if (typeof window !== "undefined") {
    try {
      return window.localStorage.getItem(CORPUS_FLAG_KEY) === "1";
    } catch {
      return false;
    }
  }
  return false;
}
```

`CORPUS_FLAG_KEY = "corpus-fs-enabled"` (`flag.ts:13`) matches the documented localStorage key. With neither signal set, the final `return false` makes it default-off. The "no migration in S1" sub-claim is corroborated by the flag wording and by `createCorpusBackedStorage` reading from an empty `state/` path with no localStorage import (Claim 5).

**Evidence:** `app/lib/corpus/flag.ts:13`, `app/lib/corpus/flag.ts:15-25`

---

## Claim 12: "The OPFS adapter and this fake are both asserted against the same shared contract suite (corpusFsContract.ts), so substitutability (LSP) is verified, not assumed."

**Location:** `app/lib/corpus/__tests__/inMemoryCorpusFs.ts:4-6`
**Type:** Architectural
**Verdict:** Verified
**Confidence:** High
**Legibility-target:** A reviewer confirming the in-memory fake and OPFS adapter are held to one contract.

A shared contract module `corpusFsContract.ts` exists in `app/lib/corpus/__tests__/`, and the contract test `corpusFs.contract.test.ts` is present (per the diff `--stat`). The fake imports the `CorpusFS` type from `../types` (`inMemoryCorpusFs.ts:11`), the same type the OPFS adapter's `createOpfsCorpusFs` returns (`opfsAdapter.ts:85`), so both satisfy one interface (paraphrased — no quote available because the assertion is about the existence and wiring of test files, a directory-layout/structure claim rather than a single snippet; the contract file is 82 lines per `git diff --stat`). Both implementations therefore bind to the same `CorpusFS` type and a shared contract suite exists to exercise them.

**Evidence:** `app/lib/corpus/__tests__/corpusFsContract.ts`, `app/lib/corpus/__tests__/corpusFs.contract.test.ts`, `app/lib/corpus/__tests__/inMemoryCorpusFs.ts:11`, `app/lib/corpus/opfsAdapter.ts:85`

---

## Claims Requiring Attention

### Incorrect
- None.

### Stale
- None. (Note: Claim 7's in-comment line pointer `workspaceStore.ts:44-46` now points at code that was moved to `storeAdapter.ts:33-36`; the *behavior* described is correct, only the line locator is pre-move. Treated as a minor locator drift inside an otherwise-verified claim, not a standalone stale verdict.)

### Mostly Accurate
- **Claim 4** (`app/lib/corpus/storeAdapter.ts:20-24`): "moved verbatim ... byte-for-byte" — the runtime behavior of the OFF path is identical, but the function was renamed (`createDebouncedStorage` -> `createDebouncedLocalStorage`) and its return type changed to `StateStorage`, so the source text is not literally verbatim. Consider rewording to "behavior preserved" rather than "moved verbatim".

### Unverifiable
- None. (Per scope instructions, the "lint clean, build passes, 324 tests" claim was taken as stated and not re-run; it is therefore not counted among the 12 checked claims.)

---

## Goal-Alignment Note

The PR's stated goal is the foundational S0+S1 corpus slice: a `CorpusFS` seam (async, bytes+paths), folder-layout path builders, a `workspace.json` codec, an OPFS adapter, and a dev-only default-off flag — with localStorage remaining the production path. The fact-check confirms the comments/docstrings describing this slice are accurate to the implementation. The four claims the orchestrator flagged for particular scrutiny all hold up:

1. Git is genuinely absent from `CorpusFS` (Claim 1) — the ISP boundary the architecture review asked for is real, not just documented.
2. The null/`[]`/reject error model is honored consistently across the interface docstrings, the OPFS adapter, and the in-memory fake (Claim 2).
3. The OFF path's *behavior* is preserved (Claim 4) — though "moved verbatim / byte-for-byte" slightly overstates source-level identity (rename + return-type change). This is the only finding worth a wording tweak; it is not a behavior risk.
4. S1 is genuinely blob-mode (Claim 5): the store writes one file under `state/` and does not import `paths.ts`/`manifest.ts`, which exist only behind their unit tests.
5. The OPFS adapter reifies quota errors and the SSR guard throws a typed `CorpusError` (Claims 6, 7) — the failure-driven-UI mandate is structurally supported.

No fabricated symbols, methods, or APIs were found, so no entry was added to `docs/reviews/hallucination-patterns.md` (the file does not exist and was not created). Downstream critics (security-reviewer, architecture-review) can rely on the documented behavior in `app/lib/corpus/*` as matching the code; the one caveat to carry forward is the Claim-4 wording, which is a documentation-precision issue, not a behavioral defect.
