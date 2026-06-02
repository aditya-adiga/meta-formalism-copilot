# API Consistency Review — feat/corpus-architecture (DD-009 S0+S1)

**Scope:** `git diff main...HEAD -- app/` (corpus FS abstraction + OPFS adapter; new module `app/lib/corpus/`)
**Date:** 2026-06-01
**Based on:** code-fact-check report (Stage 1: 11 Verified, 1 Mostly Accurate, 0 Incorrect)
**Reviewer focus:** Does the new `CorpusFS` public surface honor the conventions of the Zustand `StateStorage` shape it replaces, `app/lib/types/*`, and `workspacePersistence`? Is the error model a single substrate-neutral source? Are path-builder names internally consistent and aligned with DD-009's folder layout? Will S2/S3/S4 be able to extend the surface without breaking the contract?

---

## Baseline Conventions

Surveyed the analogous interfaces this module sits next to:

- **Storage seam (the thing being replaced):** `app/lib/stores/workspaceStore.ts` (pre-diff `createDebouncedStorage`) and `app/lib/stores/evidenceStore.ts` both define an inline storage adapter shaped exactly like Zustand's `StateStorage` (`getItem`/`setItem`/`removeItem`), feed it through `createJSONStorage(...)`, and swallow quota failures with `console.warn`. The store binds to Zustand's `StateStorage` type, never to a concrete adapter.
- **Type definitions (`app/lib/types/*`):** Domain types are bare PascalCase nouns with no `I`/`DTO`/`T` affixes — `WorkspaceManifest`, `ArtifactRecord`, `SourceDocument`, `PropositionNode`, `EvidenceSlot`. Object fields are camelCase (`currentVersionIndex`, `createdAt`, `customArtifactTypes`, `verificationStatus`). String-literal unions are the standard discriminator style: `VerificationStatus = "none" | "verifying" | ...`, `ArtifactVersion.source = "generated" | "ai-edit" | "manual-edit"`.
- **Discriminated unions:** The codebase has exactly one prior tagged union with a `kind` discriminant — `NodeKind` in `app/lib/types/decomposition.ts:1` (used as `PropositionNode.kind`). It is a flat string union, not an object-carrying union. There is **no** prior precedent for a `{ kind: ...; ...payload }` object-carrying discriminated union in this codebase.
- **Error surfacing:** Errors are not modeled as typed values anywhere in `app/lib/`. API routes return `NextResponse.json({ error: "..." }, { status: 4xx })` (`app/api/evidence-search/route.ts:148-154`, `app/api/predict/route.ts:10`). The store layer swallows persistence failures via `console.warn` (`workspaceStore.ts` pre-diff `createDebouncedStorage`, `evidenceStore.ts:32`). `evidenceStore` keeps per-element error *messages* as plain `Record<string, string>`. So there is **no existing typed-error precedent** — the `CorpusError`/`CorpusErrorKind` model is establishing a new convention, which DD-009 and the architecture review explicitly mandate (fail-loud, failure-driven UI).
- **Naming of operations:** `workspacePersistence.ts` uses `loadWorkspace`/`saveWorkspace`; the store uses `get`/`set`/`coerce`/`sanitize`. Path/FS-style verbs (`readFile`/`writeFile`/`readdir`/`rm`/`stat`) have no prior analog in the app — they are deliberately borrowed from the POSIX/`node:fs` vocabulary.

This is a **greenfield public surface**: it replaces an inline, untyped storage adapter but introduces the codebase's first FS abstraction, first typed-error model, and first object-carrying discriminated union. "Consistency" here is therefore measured against (a) the few cross-cutting conventions that do exist (field casing, bare-noun type names, `StateStorage` shape), and (b) internal self-consistency of the new surface, since most of it has no neighbor to match.

---

## Name-Pattern Audit

| New name | Category | Closest existing | Precedent path | Verdict |
|---|---|---|---|---|
| `CorpusFS` | type/interface | `WorkspaceManifest`, `ArtifactRecord`, `DecompositionState` | `app/lib/types/*.ts` | Consistent — bare PascalCase noun, no `I` prefix. `FS` is an accepted domain acronym. |
| `CorpusStat` | type | `SourceRef`, `ArtifactPointer` | `app/lib/corpus/manifest.ts`, `app/lib/types/*` | Consistent — PascalCase noun. |
| `CorpusError` | class | (no prior error class) | none — searched `app/lib/**`, `app/api/**` | New category — first typed error in the codebase. |
| `CorpusErrorKind` | type (union) | `NodeKind` | `app/lib/types/decomposition.ts:1` | Mixed — `Kind` suffix matches `NodeKind`, but the *shape* (object-carrying union) has no precedent. See Finding 3. |
| `CorpusSubstrate` | type (union) | `VerificationStatus`, `NodeKind` | `app/lib/types/session.ts:1` | Consistent — flat string union, PascalCase. |
| `CorpusWorkerError` | type | `CorpusError` (sibling) | `app/lib/corpus/types.ts` | Consistent internally; `Worker` qualifier is clear. |
| `readFile`/`writeFile`/`readdir`/`rm`/`stat` | methods | (no FS analog) `loadWorkspace`/`saveWorkspace` | `app/lib/utils/workspacePersistence.ts` | New category — POSIX/`node:fs` vocabulary; internally consistent **except** `readdir` casing. See Finding 4. |
| `toWorkerError` / `isCorpusWorkerError` / `describeCorpusError` / `assertNever` | functions | `sanitizeVerificationStatus`, `coerceDecomposition`, `isObject` | `workspaceStore.ts`, `workspacePersistence.ts` | Consistent — `is*` type-guard and verb-first helper naming matches existing `isObject`/`coerce*`/`sanitize*`. |
| `workspaceSlug`/`safeSegment`/`workspaceDir`/`sourcePath`/`artifactDir`/`artifactVersionPath`/`artifactMetaPath`/`customTypePath`/`decompositionDir`/`decompositionGraphLayoutPath` | functions | (no path-builder analog) | none — searched `app/lib/**` | New category — internally consistent `<noun>Path`/`<noun>Dir` scheme. See Finding 5 for the one outlier (`safeSegment`/`safeExt` asymmetry). |
| `SETTINGS_PATH` / `MANIFEST_VERSION` / `VERSION_PAD` / `SAFE_SEGMENT` / `CORPUS_FLAG_KEY` | consts | `WORKSPACE_KEY`, `WORKSPACE_VERSION`, `MAX_VERSIONS` | `app/lib/types/persistence.ts:4`, `artifactStore.ts` | Consistent — SCREAMING_SNAKE_CASE module consts. |
| `WorkspaceManifest`/`ArtifactPointer`/`SourceRef` | types | `PersistedWorkspace`, `ArtifactRecord`, `SourceDocument` | `app/lib/types/persistence.ts`, `decomposition.ts:52` | Mostly consistent — see Finding 6 (`SourceRef` vs existing `SourceDocument`; `customTypeIds` vs `customArtifactTypes`). |
| `createOpfsCorpusFs` / `createDebouncedLocalStorage` / `createCorpusBackedStorage` / `resolveWorkspaceStorage` | factory functions | `createDebouncedStorage` (pre-diff), `createJSONStorage` (zustand) | `workspaceStore.ts`, `evidenceStore.ts:20` | Consistent — `create*` factory verb matches the prior adapter factory and zustand's own API. |
| `isCorpusEnabled` | function | `isObject` (only `is*` in lib) | `workspaceStore.ts:32` | Consistent — `is*` boolean predicate. |
| `manifestVersion`/`currentVersion`/`createdAt`/`updatedAt`/`customTypeIds` | fields | `currentVersionIndex`, `createdAt`, `customArtifactTypes` | `app/lib/types/artifactStore.ts`, `persistence.ts` | Mostly consistent camelCase — see Finding 6 for `customTypeIds`. |

---

## Findings

#### 1. Typed error model is well-formed and single-sourced — confirm it is the intended new convention

**Severity:** Informational
**Location:** `app/lib/corpus/types.ts:25-96`
**Move:** #4 (error consistency)
**Confidence:** High

The error model does exactly what the brief asks: `CorpusErrorKind` is the single source of truth for the kind set; `CorpusError` (thrown) and `CorpusWorkerError` (serializable twin) both carry the *same* `detail: CorpusErrorKind` and differ only in transport, with `toWorkerError`/`isCorpusWorkerError` bridging them and `assertNever` enforcing exhaustiveness at compile time. This is internally consistent and the OPFS adapter (`opfsAdapter.ts:79-83`) funnels every failure through one `wrap()` that only ever mints `CorpusError`. There is no competing error convention in the codebase to clash with — the existing layers either return `{ error: string }` JSON (API routes) or `console.warn` and drop (store adapters). The new model is strictly richer and does not contradict those; it is a deliberate new convention that DD-009's "failure-driven UI" mandate calls for.

**Recommendation:** None required. Optionally note in CLAUDE.md that `CorpusError`/`CorpusErrorKind` is now the canonical error model for the corpus layer so future contributors extend it rather than reaching for `{ error: string }`.

#### 2. `CorpusErrorKind` is substrate-neutral and extensible — minor concern: substrate-specific kinds bypass the `substrate` discriminator

**Severity:** Minor
**Location:** `app/lib/corpus/types.ts:31-49`
**Move:** #6 (versioning/extensibility), #4 (error consistency)
**Confidence:** Medium

The union is largely substrate-neutral as intended: `quota-exceeded` carries `substrate: CorpusSubstrate` so S2 (FSA) and future remotes reuse one kind rather than minting `opfs-quota`/`fsa-quota`. Adding a kind is backward-compatible for producers but a compile-time break for every exhaustive consumer — the explicitly desired behavior (`types.ts:38-39` + `assertNever`). So far so good for the extend-without-breaking criterion.

However, the union is **internally asymmetric** about substrate attribution. `quota-exceeded` parameterizes substrate, but `fsa-permission-revoked`, `remote-auth-expired`, and `browser-storage-cleared` bake the substrate into the *kind name* and carry no `substrate` field. A consumer asking "which substrate failed?" must special-case: read `.substrate` for quota, infer from the kind string otherwise. So the substrate-neutral pattern the comment advertises actually holds only for `quota-exceeded`. This will not break S2/S3/S4 (each new substrate can mint its own named kinds), but it is a mild inconsistency in the union's own design vocabulary.

**Recommendation:** Acceptable as-is for S1 (these failures genuinely are substrate-specific events, not a shared condition like quota). If a future sub-task needs uniform substrate attribution, consider giving `unavailable`/`io` an optional `substrate?: CorpusSubstrate`. No action required now; note the asymmetry so it stays a deliberate choice.

#### 3. Object-carrying discriminated union (`CorpusErrorKind`) has no precedent — establishing a new union shape

**Severity:** Informational
**Location:** `app/lib/corpus/types.ts:41-49`
**Move:** #2 (naming against the grain)
**Confidence:** High

No existing precedent in `app/lib/types/` and `app/lib/` for an object-carrying discriminated union. The codebase's only prior `kind` discriminant — `NodeKind` (`app/lib/types/decomposition.ts:1`) — is a flat string union with payload living in the surrounding `PropositionNode`, not inside the union member. `CorpusErrorKind` embeds payload per-variant (`{ kind: "not-found"; path: string }`). The `Kind` suffix is consistent with `NodeKind`; the *internal shape* is new.

This is the right design for a typed-error model and the `kind` discriminant key matches `NodeKind` rather than introducing a competing `type`/`tag` key — the consistency that matters most. Flagged per the precedent rule as a new convention being set, not a violation. Severity floored at Informational (no-precedent line invoked).

**Recommendation:** None. Keep `kind` as the discriminant key for any future corpus-layer (ideally codebase-wide) tagged unions so this becomes the established convention.

#### 4. `readdir` lowercasing breaks the camelCase method convention of its own interface

**Severity:** Minor
**Location:** `app/lib/corpus/types.ts:120` (consumers: `opfsAdapter.ts:125`, `corpusFsContract.ts:26`)
**Move:** #2 (naming against the grain)
**Confidence:** High

No existing precedent in `app/lib/` for filesystem method names — `CorpusFS` is the first. Within the interface, four of five methods are camelCase or atomic (`readFile`, `writeFile`, `rm`, `stat`) while `readdir` is the only multi-word method rendered all-lowercase. The codebase's universal method/function convention is camelCase (`getArtifactContent`, `setCustomArtifactContent`, `coerceArtifactRecord`). `readdir` matches POSIX/`node:fs` (itself all-lowercase), so this is a deliberate borrow — but it sits inconsistently next to the camelCase `readFile`/`writeFile` *in the same interface*. A consumer will reach for `readDir` by analogy to `readFile` and get a compile error.

A one-character cognitive-load issue, not a break (consumers bind to whatever the interface says). But it is cheap to fix now (S2/S3/S4 have not bound yet) and expensive once every adapter + the contract test depend on it.

**Recommendation:** Either rename to `readDir` for consistency with the sibling `readFile`/`writeFile`, **or** keep `readdir` deliberately (full `node:fs` parity) and add a one-line comment in `types.ts` noting the casing is intentional so it does not read as a typo. Decide before S2 binds.

#### 5. Path-builder sanitizers are asymmetric: `safeExt` is fail-silent where `safeSegment`/`workspaceSlug` are fail-loud

**Severity:** Minor
**Location:** `app/lib/corpus/paths.ts:36-64`
**Move:** #7 (asymmetry)
**Confidence:** Medium

Three sanitizers with inconsistent visibility and failure mode:
- `workspaceSlug` (exported) — lowercases, **throws** on empty.
- `safeSegment` (exported) — preserves case, **throws** on empty.
- `safeExt` (private) — lowercases, **defaults to `"bin"`** instead of throwing.

The visibility split is defensible (`safeExt` is an implementation detail of `sourcePath`), but the *failure-mode asymmetry* is a latent contract issue: the two segment sanitizers are fail-loud (matching the manifest codec's fail-loud stance at `manifest.ts:64-67`), while `safeExt` is fail-silent. `sourcePath(slug, id, "💥")` silently produces `.../sources/<id>.bin`, and that on-disk extension will not match the `ext` value a consumer stores in / reads back from `SourceRef.ext` (the manifest records the caller's original `ext`, `manifest.ts:30`). For S4 migration, where `ext` builds the source path *and* the manifest entry, this can desync the filename from the manifest's `ext`.

**Recommendation:** Make the source of truth explicit — either have `sourcePath` return the sanitized ext so callers store the same value that lands on disk, or have `safeExt` throw on empty like its siblings and require callers to pre-sanitize. Aligning the failure mode with the module's otherwise-consistent fail-loud posture is the cheaper fix.

#### 6. Manifest field/type names drift from existing persistence vocabulary

**Severity:** Inconsistent
**Location:** `app/lib/corpus/manifest.ts:27-42`
**Move:** #2 (naming against the grain), #7 (asymmetry)
**Confidence:** Medium

Precedent: `customArtifactTypes` / `customArtifactData` used in `app/lib/stores/workspaceStore.ts:169-170` and `app/lib/types/persistence.ts:33-36`; `SourceDocument` used in `app/lib/types/decomposition.ts:52`.

1. **`customTypeIds`** (manifest) vs **`customArtifactTypes`** (store/persistence). The domain noun everywhere in the app is "custom **artifact** types" — `customArtifactTypes`, `customArtifactData`, `CustomArtifactTypeDefinition`, `CustomArtifactTypeId`, the `/api/custom-type` route, the `"custom-"`-prefix validation. The manifest drops "artifact" and pluralizes "Ids" → `customTypeIds`. A consumer who knows the store's `customArtifactTypes` will not immediately connect it to the manifest's `customTypeIds`. Since the manifest is the on-disk index S4 must reconcile against the store's `customArtifactTypes`, the mismatched name adds friction exactly at the integration seam.

2. **`SourceRef`** (manifest) vs **`SourceDocument`** (existing, `decomposition.ts:52`). Both describe a stored source. Two types is defensible (`SourceRef` is the light index entry, `SourceDocument` the richer in-memory form), but nothing in the naming signals one is the persisted reference of the other.

**Recommendation:** Rename `customTypeIds` → `customArtifactTypeIds` to match the pervasive `customArtifactType*` vocabulary (cheap, no consumers yet; highest value because it sits on the S4 reconciliation path). For `SourceRef`, either add a doc-comment cross-referencing `SourceDocument`, or rename to `PersistedSourceRef`/`SourceManifestEntry`.

#### 7. `flag.ts` dual-key convention (`NEXT_PUBLIC_CORPUS_FS` env vs `corpus-fs-enabled` localStorage) is internally split

**Severity:** Minor
**Location:** `app/lib/corpus/flag.ts:13-25`
**Move:** #2 (naming against the grain)
**Confidence:** Low

No existing precedent in `app/lib/` and `app/` for feature flags (grep for `NEXT_PUBLIC`/`isEnabled`/`FLAG` found none outside this module) — first of its kind. The flag is internally split: the env var is `NEXT_PUBLIC_CORPUS_FS` (no "enabled" token) while the localStorage key is `corpus-fs-enabled` (with "enabled"). Both use `=== "1"`, which is at least consistent. Purely a new-convention-being-set situation, so severity floored per the no-precedent downgrade. The localStorage key shares the namespace with store keys (`workspace-zustand-v1`, `workspace-v2`) but cannot collide today (distinct `-enabled` suffix).

**Recommendation:** Optionally align the tokens (`NEXT_PUBLIC_CORPUS_FS_ENABLED` + `corpus-fs-enabled`). Since this is the codebase's first feature flag, pick the canonical shape deliberately — future flags will copy it.

#### 8. `createCorpusBackedStorage` hand-builds `state/<name>.json`, bypassing the `paths.ts` choke point

**Severity:** Minor
**Location:** `app/lib/corpus/storeAdapter.ts:55`
**Move:** #7 (asymmetry / consistency with the module's own contract)
**Confidence:** Medium

`paths.ts:16-19` states the contract explicitly: *"The only source of corpus paths is this module — callers must never hand-concatenate."* But `createCorpusBackedStorage` hand-builds `` `state/${name}.json` `` inline rather than going through a `paths.ts` builder. For S1 this is harmless (the blob lives at a fixed `state/` location outside the `workspaces/` layout by design — `storeAdapter.ts:9-12` — and `name` is the zustand store key, not untrusted input). But it is the one place in the new module that violates the "single source of corpus paths" invariant the module advertises — the kind of asymmetry that erodes a freshly-established contract. When S4 moves the store off the blob onto the folder layout, this inline path is the thing most likely to be missed.

**Recommendation:** Add a `statePath(name: string)` builder (or `STATE_DIR`) to `paths.ts` and call it here, so 100% of corpus paths flow through the documented choke point. Cheap now; keeps the invariant honest.

---

## What Looks Good

- **The seam is typed as `CorpusFS`, not a concrete adapter.** `storeAdapter.ts:52` (`createCorpusBackedStorage(fs: CorpusFS)`) and `workspaceStore.ts:499` bind to the interface, so the S3 worker-proxy and S2 FSA adapter drop in without the store knowing. Directly satisfies the "extend without breaking" criterion and mirrors how the store already binds to zustand's `StateStorage`.
- **`StateStorage` shape preserved exactly.** Both `createDebouncedLocalStorage` and `createCorpusBackedStorage` return the `getItem`/`setItem`/`removeItem` triple, identical to the pre-diff inline adapter and `evidenceStore`. The OFF path is moved verbatim (confirmed by the characterization test), so existing consumers see byte-for-byte prior behavior.
- **Git correctly kept off the FS interface.** `CorpusFS` has zero git methods; the header (`types.ts:19-22`) reserves commit/log/push/pull for a separate `CorpusGit` interface "over" a `CorpusFS`. The single most important extensibility decision for S3, and it is honored — the in-memory fake and every non-git consumer are not forced to stub git ops (ISP).
- **`null`/`[]` not-found convention is uniform and documented.** `readFile`/`stat` return `null`, `readdir` returns `[]`, everything else rejects with `CorpusError` — stated in `types.ts:18-19`, enforced by the shared contract suite (`corpusFsContract.ts:21-27`), honored by the OPFS adapter. Callers never see `undefined`.
- **One shared contract suite holds the fake and the real adapter to identical behavior** (`corpusFsContract.ts`), including the S4 access pattern (30 versions in one dir) and full-byte round-trip — substitutability is tested, not assumed.
- **Path builders are internally consistent** (`<noun>Dir` / `<noun>Path`, all relative-to-root, all routing through one sanitizer), and the traversal guard is a real single choke point for untrusted titles (modulo Finding 8).
- **Const/factory/type-guard naming all match existing conventions** (`SCREAMING_SNAKE` consts, `create*` factories, `is*` guards, bare-noun PascalCase types).

---

## Summary Table

| # | Finding | Severity | Location | Confidence |
|---|---------|----------|----------|------------|
| 6 | Manifest `customTypeIds`/`SourceRef` drift from `customArtifactTypes`/`SourceDocument` | Inconsistent | `manifest.ts:27-42` | Medium |
| 4 | `readdir` lowercasing breaks interface's own camelCase | Minor | `types.ts:120` | High |
| 5 | `safeExt` fail-silent vs `safeSegment`/`workspaceSlug` fail-loud asymmetry | Minor | `paths.ts:36-64` | Medium |
| 8 | `state/<name>.json` hand-built, bypasses paths.ts choke point | Minor | `storeAdapter.ts:55` | Medium |
| 2 | `quota-exceeded` parameterizes substrate; sibling kinds bake it into the name | Minor | `types.ts:31-49` | Medium |
| 7 | `flag.ts` env vs localStorage token split | Minor | `flag.ts:13-25` | Low |
| 1 | Typed error model single-sourced and well-formed (new convention) | Informational | `types.ts:25-96` | High |
| 3 | Object-carrying discriminated union — no precedent, new union shape | Informational | `types.ts:41-49` | High |

---

## Overall Assessment

This is a clean, internally consistent foundational surface that is **well-positioned for S2/S3/S4 to extend without breaking the contract** — the three load-bearing decisions (interface-typed seam, git excluded from `CorpusFS`, single-sourced `CorpusErrorKind` feeding both error twins) are correct and directly satisfy the success criterion. Nothing in the diff bakes the OPFS-only S1 implementation into the shared contract: OPFS specifics live entirely in `opfsAdapter.ts` behind `CorpusFS`, and `CorpusSubstrate`/`quota-exceeded` are already substrate-neutral so FSA and remote reuse them. There are **no Breaking findings** — this is a new module with no external consumers yet, and the OFF path is byte-for-byte preserved.

The one **Inconsistent** finding (#6) and the four Minor findings are all fixable in place and worth resolving *now*, while the surface is still unbound, precisely because this PR is the contract everything downstream binds to — `readdir` casing, `customTypeIds`→`customArtifactTypeIds`, and the `paths.ts` choke-point leak each get more expensive once S2-S4 bind to them. None indicate the author skipped surveying conventions; the field casing, factory/guard naming, `StateStorage` shape, and `kind`-discriminant choice all show the existing code was read. The drifts cluster where the new module had to *invent* vocabulary (FS verbs, typed errors, manifest index fields) the codebase had no prior word for — exactly where deliberate convention-setting, not consistency-matching, is the right frame.

---

## Goal-Alignment Note

**User goal:** Comprehensive code review of `feat/corpus-architecture` before opening a PR; this pass covers API consistency of the new corpus public surface.

This review directly serves the stated success criterion ("Will S2/S3/S4 be able to extend this surface without breaking the contract?"). The answer is **yes** — the seam typing, git exclusion, and single-sourced error union are the right extensibility foundations, and no OPFS-only detail leaks into the shared contract (the one item explicitly asked to be flagged). The findings are concentrated on naming/internal-symmetry drift in invented vocabulary, none of which block the PR, but four (Findings 4, 6, 8, and optionally 7) are cheapest to fix *before* S2 binds to the interface and are the highest-leverage edits to make in this PR rather than a follow-up. No finding contradicts the architecture-review or fact-check inputs; this pass builds on them and treats their documented behavior (fail-loud manifest, substrate-neutral errors, interface-typed seam) as the verified foundation.
