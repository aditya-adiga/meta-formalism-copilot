# Tech Debt Triage: feat/corpus-architecture (DD-009 S0+S1)

**Mode:** Advisory (large diff). All findings are **Consider-tier** — none block the PR.
**Scope reviewed:** `git diff main...HEAD -- app/` (corpus FS layer + workspaceStore seam). Docs excluded.
**Reference plan:** `docs/working/decomposition-corpus-architecture.md` (what is already staged vs genuinely un-tracked debt).

## What this slice introduces

A foundational `app/lib/corpus/` filesystem layer behind a default-off, dev-only flag:
- `types.ts` — `CorpusFS` interface + `CorpusError`/`CorpusWorkerError` kind union (consumed)
- `opfsAdapter.ts` — OPFS implementation of `CorpusFS` (consumed via `storeAdapter`)
- `flag.ts` — `isCorpusEnabled()` dev flag (consumed)
- `storeAdapter.ts` — store storage-seam selector; blob-mode corpus storage (consumed by `workspaceStore.ts`)
- `paths.ts` — folder-layout path builders (**not consumed outside tests**)
- `manifest.ts` — `workspace.json` codec (**not consumed outside tests**)
- `workspaceStore.ts` — debounced-localStorage adapter extracted into `storeAdapter`, store now selects storage via `resolveWorkspaceStorage()`

The decomposition explicitly stages migration (S4), FSA mirror (S2), git (S3), and failure-UI (S5) as later sub-tasks. Most of what an ad-hoc reviewer would flag as "incomplete" is **planned, tracked debt**, not accidental debt. The triage below separates the two.

---

## Triage Summary

| # | Debt Item | Carrying Cost | Cost of Deferral | Failure Cost | Fix Cost | Urgency | Recommendation |
|---|-----------|:---:|:---:|:---:|:---:|---|---|
| 1 | `paths.ts` + `manifest.ts` built but unused until S4 (dead-until-later) | Low | +0 (inert) — tracked by decomposition | | Hours (delete if S4 cut) | Drift risk if S4 layout changes | Carry intentionally |
| 2 | Corpus storage seam is async + un-debounced; sync→async behavior gap vs OFF path | Low | +0.25 day fix work per consuming sub-task (S2/S3) | Med × Med — silent write loss under the dev flag (no sync-ack; DD-009 forbids silent fallback) | Days | Lands when S2/S3 wire real writers | Defer and monitor |
| 3 | Stale `layout.ts` reference in `storeAdapter.ts` doc-comment (file renamed to `paths.ts`) | Low | +0 (inert) | | Minutes | None | Fix opportunistically |
| 4 | Playwright OPFS smoke documented but not run/automated | Low | +0 (inert) until S2/S3 broaden OPFS use | Low × Med — OPFS success path unverified in CI; regressions invisible | Hours (run) / Days (automate) | Before enabling flag for any non-dev use | Defer and monitor |
| 5 | Dev flag enabled = empty corpus, no migration (data "loss" on toggle) | Low | +0 (inert) — explicitly S4 | Low × Low — dev-only, documented in `flag.ts` + CLAUDE.md | (S4 delivers) | Must not ship flag default-on pre-S4 | Carry intentionally |

No row escalates to **Fix now**. The branch is a clean substrate swap with honestly-staged follow-on work.

---

## Individual assessments

### 1. `paths.ts` + `manifest.ts` built but unused until S4

**Location:** `app/lib/corpus/paths.ts`, `app/lib/corpus/manifest.ts`
**Nature:** Dead-until-later code (S0 contracts landed ahead of their S4 consumer).
**Cost of Deferral:** `+0 (inert)` — the decomposition explicitly assigns folder-layout population to S4 ("paths.ts/manifest.ts are built but not used by the store until S4"; `storeAdapter.ts:11`). This is staged, not forgotten.

**Carrying Cost: Low.** Both files are pure, well-tested (`paths.test.ts`, `manifest.test.ts`), and self-contained. Confirmed zero non-test consumers via grep. They cost nothing day-to-day; the only carrying cost is the small cognitive "why is this here if nothing calls it?" — fully answered by the module doc-comments and the decomposition. This is acceptable staging, not premature abstraction: settling the on-disk shape and the path-traversal guard (the `SAFE_SEGMENT` choke point in `workspaceSlug`) *before* S2/S3/S4 build on top is exactly the "foundational, blocks others" ordering the decomposition prescribes. Building them now is cheaper than retrofitting a layout under three consumers later.

**The one real risk:** if S4's actual migration reveals the layout is wrong (e.g., `meta.json` provenance shape needs a field these builders don't anticipate), this code is rewritten and the intervening tests were sunk cost. That risk is inherent to settling contracts early and is bounded — these are ~225 lines of pure functions, hours to revise.

**Fix Cost:** Scope localized; effort hours; risk low; incremental yes. "Fixing" here means either (a) deleting if S4 is cut, or (b) doing nothing and letting S4 consume them.

**Urgency Triggers:** Only if S4 is deprioritized indefinitely — then these become true dead code and should be deleted rather than carried. No imminent trigger.

**Recommendation: Carry intentionally.** This is defensible staging, not debt to repay. Revisit only if S4 slips off the roadmap, at which point delete.

---

### 2. Corpus storage seam is async and un-debounced; behavioral gap vs the OFF path

**Location:** `app/lib/corpus/storeAdapter.ts:52-68` (`createCorpusBackedStorage`) vs `:25-46` (`createDebouncedLocalStorage`)
**Nature:** Structural / shortcut — the two storage adapters behind the same `resolveWorkspaceStorage()` seam have materially different write semantics.
**Cost of Deferral:** `+0.25 day fix work per consuming sub-task` — each later sub-task (S2 FSA mirror, S3 git push) that wires a real writer behind this seam inherits the missing debounce + missing sync-ack and has to add its own.
**Failure Cost:** `Med × Med` — under the dev flag, every `setItem` is an un-debounced async OPFS write whose completion is never observed by the store. A failed write rejects into a floating promise (zustand's persist does not await it), so a quota or i/o failure is silently dropped — precisely the "silent fallback" DD-009 §Failure-driven forbids. Blast radius is dev-only today, which caps severity.

**Carrying Cost: Low.** The flag is off by default and dev-only, so nobody hits this path in production. The debt is purely latent: it costs nothing now and becomes friction only when S2/S3 build real writers on this seam.

Two concrete gaps the reviewer should note (both are *forward* costs, not present bugs):
1. **Debounce dropped.** The OFF path coalesces writes over 300ms (`createDebouncedLocalStorage`); the corpus path writes on every `setItem`. For OPFS this is tolerable, but S3's git-commit-on-write would amplify it into a commit per keystroke unless debounce/batching is reintroduced at this seam.
2. **No sync-ack.** `createCorpusBackedStorage.setItem` resolves on OPFS-write-completion. The decomposition's sync-ack contract (interface #4) explicitly says the "saved" indicator must derive from the FSA/remote ack, *not* the OPFS write-ack, because "OPFS write completed ≠ bytes on disk." This seam currently exposes only the OPFS ack. That's correct for S1 (no indicator exists yet) but the seam shape will need to surface ack state for S5.

Neither is wrong *for S1* — the slice is honestly scoped as "a pure substrate swap." But the seam as drawn does not yet have a place to hang the debounce or the sync-ack, so S2/S3/S5 will each push against its shape.

**Fix Cost:** Scope cross-cutting (the seam is the integration point for S2/S3/S5); effort days when actually addressed; risk medium (touches the write path every consumer shares); incremental yes (debounce and ack can be added independently). Do **not** fix now — fixing ahead of S2/S3 means designing the ack contract without its consumers, which the decomposition already warns against (interface #4 is owned by S5).

**Urgency Triggers:** Reaching S3 (commit-on-write) without reintroducing debounce → commit storms. Reaching S5 without a place to surface the ack → the "saved" indicator can't be built without reshaping this seam.

**Recommendation: Defer and monitor.** Re-evaluate at the start of S2 (FSA mirror) — that is the first sub-task that adds a second async writer behind this seam and will reveal whether the seam shape holds. Carry a note into the S2/S3 plans: "reintroduce write coalescing and sync-ack at `storeAdapter`."

---

### 3. Stale `layout.ts` reference in `storeAdapter.ts`

**Location:** `app/lib/corpus/storeAdapter.ts:11` — comment says "the files-per-artifact folder layout (layout.ts/manifest.ts)" but `layout.ts` was renamed to `paths.ts` (commit `122d70f`, Next.js reserved-name collision).
**Nature:** Documentation rot (introduced by the rename within this same branch).
**Cost of Deferral:** `+0 (inert)` — single stale token; will not spread.

**Carrying Cost: Low.** A reader chasing `layout.ts` finds no such file, costing a few seconds of confusion. Worth noting only because it's a *new* inconsistency the branch introduced (the rename updated the filename and CLAUDE.md but missed this one in-code comment) — likely the source of code-fact-check's single "Mostly Accurate" item.

**Fix Cost:** Minutes; trivial; no risk. Change `layout.ts/manifest.ts` → `paths.ts/manifest.ts`.

**Urgency Triggers:** None.

**Recommendation: Fix opportunistically.** Cheap enough to fold into the PR-prep cleanup pass since the branch is already open and this is its own regression.

---

### 4. Playwright OPFS smoke documented but not run/automated

**Location:** `docs/spikes/corpus-opfs-smoke.md` (test plan exists; no runner wired). `opfsAdapter.ts` success path is unverified by the Vitest suite (jsdom has no OPFS — CLAUDE.md confirms).
**Nature:** Testing debt.
**Cost of Deferral:** `+0 (inert)` while the flag stays dev-only and OPFS usage is the single blob file. Begins to compound once S2/S3 add more OPFS-resident structure.
**Failure Cost:** `Low × Med` — the OPFS adapter's happy path (the actual `navigator.storage` round-trip) runs in **no automated test**. Vitest covers error-mapping and the in-memory fake; the real OPFS write/read/readdir/rm is exercised only by a smoke that hasn't been run. A regression in `opfsAdapter.ts` (e.g., a `createWritable` API drift) would pass CI green. Severity is capped because the flag is off for users.

**Carrying Cost: Low.** The in-memory fake + contract test (`corpusFsContract.ts`) give real confidence that *the interface* behaves; only the OPFS-binding layer is unverified, and that layer is small (one file, thin handle-walking). The mitigation is documented and the constraint (jsdom limitation) is real and unavoidable in the Vitest harness.

**Fix Cost:** Running the smoke once: hours. Automating it (Playwright in CI against headless Chromium): days, and adds a browser-runner dependency to CI the project does not currently have. The cost/benefit of full automation is weak while the surface is one blob file.

**Urgency Triggers:** Before the flag is enabled for anyone beyond the original author (the smoke is the only happy-path evidence). Before S2/S3 add OPFS structure complex enough that the in-memory fake diverges from real OPFS semantics (e.g., directory-handle edge cases).

**Recommendation: Defer and monitor.** Run the smoke manually before merge to convert "documented" into "observed at least once," and record the result in the spike doc. Defer CI automation until S2/S3 justify the browser-runner investment. Re-evaluate the automate-vs-manual call at the start of S2.

---

### 5. Dev flag enabled = empty corpus, no migration (data "loss" on toggle)

**Location:** `app/lib/corpus/flag.ts:1-11` (doc-comment), enforced by absence of migration (S4).
**Nature:** Deliberate scope boundary, surfaced as a flag hazard.
**Cost of Deferral:** `+0 (inert)` — S4 delivers migration; this is the explicit S1↔S4 boundary, not un-tracked debt.
**Failure Cost:** `Low × Low` — the only person who can trigger it is a developer who sets `NEXT_PUBLIC_CORPUS_FS=1` or the localStorage flag, and the hazard is documented in three places (`flag.ts` doc-comment, CLAUDE.md, the decomposition). No end-user blast radius.

**Carrying Cost: Low.** Correctly fenced. The flag doc-comment is explicit: "enabling this starts from an EMPTY corpus … must not be turned on for end users until S4 ships migration."

**Fix Cost:** Not a fix — S4 *is* the resolution. Doing migration now would pull S4 forward, which the decomposition deliberately sequenced after S1.

**Urgency Triggers:** The single real risk is the flag accidentally shipping default-on before S4. Worth one guard: ensure no env config or deploy template sets `NEXT_PUBLIC_CORPUS_FS=1`, and consider a louder in-app warning if the runtime flag is set in a non-dev build.

**Recommendation: Carry intentionally.** This is the planned staging boundary, well documented. The only follow-up is a CI/config check that the flag can't ship enabled — cheap insurance, fold into S4's plan.

---

## Recommended order

1. **#3 (stale comment)** — fold into the current PR-prep cleanup; minutes, it's the branch's own regression.
2. **#4 (run the smoke once)** — before merge, convert "documented" to "observed," record in the spike doc. Cheap, raises confidence in the one untested layer.
3. **#1, #5** — no action; carry as documented staging. Add a one-line guard against the flag shipping enabled (#5) into the S4 plan.
4. **#2 (async seam: debounce + sync-ack)** — defer to the start of S2; carry a note into the S2/S3/S5 plans so the seam reshaping is anticipated, not discovered.

Net: this is a healthy foundational slice. The deliberate dead-until-S4 code (#1) and the no-migration flag (#5) are honestly tracked by the decomposition and belong in "carry intentionally." The only items worth touching before merge are the trivial stale comment (#3) and running the smoke once (#4). The async-seam gap (#2) is the one piece of genuine forward-cost debt worth flagging to future sub-tasks, but it is correctly out of scope for S1.

---

## Goal-Alignment Note

**PR goal:** Implement DD-009 S0+S1 — a foundational corpus FS layer behind a default-off dev flag, deliberately staging migration (S4), FSA mirror (S2), git (S3), and failure-UI (S5) for later.

This triage **supports the goal as scoped.** The branch does what it claims: a clean, well-tested substrate swap that leaves localStorage as the default path untouched (characterization test confirms byte-for-byte OFF behavior). None of the five debt items contradict the staged plan — four of them (#1, #2, #4, #5) are explicit consequences of the chosen staging and are tracked in `decomposition-corpus-architecture.md`; only #3 (stale comment) is an un-tracked, branch-introduced regression, and it is trivial.

The triage does **not** recommend pulling any later sub-task's work forward into this PR. The most important alignment caveat is forward-looking: the storage seam (#2) is drawn for S1's blob-mode simplicity and will need to grow a debounce/coalescing hook and a sync-ack surface when S2/S3/S5 land. That reshaping is anticipated by the decomposition's interface-#4 contract, so it is a "carry the note forward" item, not a "fix before merge" item. Approving this PR commits the project to that future seam work — which is exactly the commitment the decomposition already made.
