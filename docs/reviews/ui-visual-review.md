# UI Visual Review — feat/evidence-scoring (evidence-scoring UI)

**Commit:** 0a96cce
**Scope:** Branch diff `main...HEAD`, UI-rendering files only
**Date:** 2026-05-21
**Based on:** code-fact-check report (Claim 8 fixed in 0a96cce; fact-check did not cover visual/layout)

## Environment

- **Files reviewed:**
  - `app/components/features/evidence-search/EvidenceScoreBadge.tsx` (new)
  - `app/components/features/evidence-search/EvidenceResultsSection.tsx`
  - `app/components/features/evidence-search/EvidencePaperCard.tsx`
  - `app/components/features/evidence-search/FindEvidenceButton.tsx`
  - Context (not modified): `app/components/panels/ArtifactPanelShell.tsx`, `StatisticalModelPanel.tsx`, `CounterexamplesPanel.tsx`
- **Target viewports:** 320–480px (small mobile), 768–1024px (tablet/laptop), 1920px+ (desktop)
- **Target browsers / platforms:** modern evergreen browsers + mobile Safari
- **Review mode:** Mechanical (checklist items 1–5 and 8)
- **Primary authority:** `docs/UI_LAYOUT_GUIDELINES.md` (project root `/home/magfrump/aisc_lct/`)

## Findings

#### Combined-score sort uses `?? -1`, so a partial score sums against a sentinel that is never shown

**Severity:** Minor
**Location:** `app/components/features/evidence-search/EvidenceResultsSection.tsx:8-14`
**Issue type:** Other (sort-order correctness — visual ordering)
**Viewport:** all
**Move:** Review of sort-by-score display logic
**Confidence:** Medium

`sortByScore` computes `(a.reliability?.score ?? -1) + (a.relatedness?.score ?? -1)`. Scores are 0–1, so a paper missing one dimension is penalized by a `-1` sentinel that the badges never visually represent. Because scoring is applied to the whole slot at once (`slot.scored` gates the sort, and the scoring API scores all papers together), in practice all papers are scored or none are, so mixed-partial states should not occur and the sort is well-defined. This is a latent ordering ambiguity, not a live bug — flagging so the author confirms the "all-or-nothing scoring" invariant holds and no future code path can leave a slot partially scored.

**Recommendation:** No code change required if the all-or-nothing invariant is guaranteed. If partial states ever become possible, sort on a normalized average and place unscored papers in a separate trailing group rather than summing sentinels. **Legibility-target: for-author.**

#### Red-flag list has no scroll cap; a paper with many flags can grow the card unboundedly

**Severity:** Minor
**Location:** `app/components/features/evidence-search/EvidencePaperCard.tsx:79-86`
**Issue type:** Overflow
**Viewport:** all (worst at 320–480px height)
**Move:** Step 2 item 1 (unbounded content without scroll caps); guidelines §1
**Confidence:** Medium

The red-flags block renders `paper.reliability.redFlags.map(...)` with one `<div>` per flag and no `max-h-*` / `overflow` cap. `redFlags` is LLM-generated (see the scoring prompt in `app/api/evidence-score/route.ts`) and its length is not bounded by the UI. A pathological response with many flags would stretch a single card, pushing sibling cards and the action button down. Per guidelines §1, any container whose children can grow unboundedly must have a `max-h-*` + `overflow`. Per-flag text is short, so horizontal overflow is unlikely, but vertical growth is uncapped and each flag `<div>` also lacks `break-words`.

**Recommendation:** Cap the flag list and add `break-words`. Realistic flag count is small (typically 0–3), so this is defense-in-depth against a misbehaving model rather than an expected condition.

```tsx
// before
<div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
  {paper.reliability.redFlags.map((flag, i) => (
    <div key={i}>&#9888; {flag}</div>
  ))}
</div>
// after
<div className="max-h-24 overflow-y-auto text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
  {paper.reliability.redFlags.map((flag, i) => (
    <div key={i} className="break-words">&#9888; {flag}</div>
  ))}
</div>
```

**Legibility-target: for-author.**

#### Score button text `text-[10px]` is below the project's clickable-text minimum and the WCAG target-size floor

**Severity:** Minor
**Location:** `app/components/features/evidence-search/EvidenceResultsSection.tsx` (Score papers / Re-score button)
**Issue type:** Sizing / Affordance
**Viewport:** all
**Move:** Step 2 item 5 + guidelines §6 (minimum contrast and size); Step 2 item 8 (state coverage)
**Confidence:** Medium

Guidelines §6 set "Clickable text" at `text-sm` minimum. The new **Score button** uses `text-[10px]` with `px-1.5 py-0.5`, giving a computed height of roughly 14px — under WCAG 2.5.8's 24×24px AA floor and well under the project's own §6 minimum for interactive text. The sibling `FindEvidenceButton` uses `text-xs ... px-2 py-0.5`, so the new button is also visually inconsistent with the established control next to it. (The read-only score/study-type badges and the "(scored)" tag also use `text-[10px]`, but those are non-interactive metadata consistent with the existing in-card citation tags, so they are acceptable.)

**Recommendation:** Bump the Score button to `text-xs` and match `FindEvidenceButton`'s padding so the target reaches ~24px tall and the two controls look consistent.

```tsx
// before
className="text-[10px] ... border border-[#DDD9D5] rounded px-1.5 py-0.5 ..."
// after — align with FindEvidenceButton sizing
className="text-xs ... border border-[#DDD9D5] rounded-md px-2 py-0.5 ..."
```

**Legibility-target: for-author.**

#### Badge tooltip relies solely on the native `title` attribute — not keyboard- or touch-accessible

**Severity:** Minor
**Location:** `app/components/features/evidence-search/EvidenceScoreBadge.tsx:27`
**Issue type:** Affordance
**Viewport:** all (worst on touch)
**Move:** Step 2 item 8 (hover/focus equivalence on interactive-ish elements)
**Confidence:** High

The full rationale (`Reliability: ...` / `Relatedness: ...`) is delivered only via the `title` attribute. Native `title` tooltips appear on pointer hover, do not surface on touch devices, and are not reliably reachable by keyboard (the `<span>` is not focusable). On a phone the rationale is simply unavailable, and this is the only place the rationale text is shown — so the information is effectively pointer-only.

**Recommendation:** Acceptable for a v1 if the rationale is considered supplementary, but note the limitation. If the rationale is meant to be discoverable, surface it on a non-hover path — lowest effort is to render it inside the existing "Show more" card expansion in addition to the `title`. **Legibility-target: for-author.**

## What Looks Good

- **`EvidencePaperCard` title row restructure** (`EvidencePaperCard.tsx:30-60`) correctly applies `min-w-0` to the flexible title column and `shrink-0` to the badge cluster — the textbook fix for flex-truncation. With `break-words` on the title link, long titles wrap instead of forcing horizontal overflow or squeezing the badges. Matches guidelines §4 exactly.
- **Focus-visible rings added across all touched interactive elements** — "Show more" (`EvidencePaperCard.tsx:97`), the collapse toggle and Score button (`EvidenceResultsSection.tsx`), and `FindEvidenceButton` (`FindEvidenceButton.tsx:30`) all gained `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30`. Real improvement over the prior state (no visible focus indicator); satisfies WCAG 2.4.7.
- **Score button `active:` and `disabled:` states** (`EvidenceResultsSection.tsx`) — `active:bg-[#ECE7E2]` gives pressed feedback and `disabled:opacity-50 disabled:cursor-wait` communicates the in-flight scoring state. Full default/hover/focus/active/disabled coverage on the new control.
- **Score button label updates rather than disappearing** — `isScoring ? "Scoring..." : slot.scored ? "Re-score" : "Score papers"`. Follows guidelines §7 ("a control that can be used again should never disappear") precisely.
- **Badge color encoding uses border + background + text together** (`EvidenceScoreBadge.tsx`), not color alone, and the numeric score is shown as a redundant non-color channel — good for WCAG 1.4.1.

## Best Practices Applied

| Principle | Source | How Applied |
|-----------|--------|-------------|
| Flex child truncation fix | guidelines §4; MDN flexbox `min-width` | `min-w-0` on title column, `shrink-0` on badge cluster |
| Visible focus indicators | WCAG 2.4.7 | `focus-visible:ring-2` added to all four touched controls |
| Control persists with updated label | guidelines §7 | Score button toggles label across idle/scoring/scored states |
| Full interactive state matrix | Step 2 item 8 | Score button covers default/hover/focus/active/disabled |
| Text reflow on narrow viewports | guidelines §1; WCAG 1.4.10 | `break-words` on paper title |
| Color not the only channel | WCAG 1.4.1 | Badge shows numeric score alongside traffic-light color |

## Keyboard Navigation

The diff is **in scope** — it adds/modifies focusable elements (the Score button, plus focus styling on the collapse toggle, "Show more", and Find-evidence buttons). No modals/overlays/dropdowns are added.

**Focus order.** Within a results section the tab order is: collapse toggle → Score button → (per card) title link → "Show more" → next card. This matches visible reading order — the toggle and Score button share a row via `flex justify-between`, and DOM order places the toggle before the Score button, matching left-to-right visual order. No `flex-direction: row-reverse`, CSS `order`, or absolute positioning reorders these, so there is no WCAG 2.4.3 mismatch. The badge cluster in each card is non-focusable (`<span>`s) and is correctly skipped.

**Escape-key behavior.** N/A — no modals or overlays in this diff. Expand/collapse and "Show more" are inline disclosure controls, not focus-managing regions.

**Skip-link presence.** N/A — diff does not change page-level structure (no `<header>`/`<nav>`/`<main>`/`<aside>`/`<footer>` added or restructured).

**Focus-trap risks.** No focus-trap risks identified. All new focusables are standard `<button>` elements in normal flow; the disabled Score button uses the native `disabled` attribute (not `aria-disabled`), so it is correctly removed from the tab order while scoring.

## Viewport Verification Checklist

- [x] 360px mobile: content reachable, no horizontal overflow (title `break-words` + `min-w-0` prevents push-out; badge cluster `shrink-0` stays intact). Red-flag list vertical growth is uncapped (Finding 2) but does not cause horizontal overflow.
- [x] 1366x768 (common laptop): Score button visible in the results header row; no clipping. Note: the buttons live inside the panel-level `overflow-y-auto` region (`ArtifactPanelShell.tsx:87`) and scroll with content — this is the established inline-control pattern (same as the existing search button), not a regression.
- [x] 1920x1080 (standard desktop): layout fills space; badges right-align via `justify-between` without excessive whitespace.

## Summary Table

| # | Finding | Severity | Issue type | Location | Confidence |
|---|---------|----------|------------|----------|------------|
| 1 | Sort sums score sentinels (`?? -1`); latent ordering ambiguity for partial scores | Minor | Other | `EvidenceResultsSection.tsx:8-14` | Medium |
| 2 | Red-flag list has no scroll cap | Minor | Overflow | `EvidencePaperCard.tsx:79-86` | Medium |
| 3 | Score button `text-[10px]` below clickable-text minimum / 24px target | Minor | Sizing | `EvidenceResultsSection.tsx` | Medium |
| 4 | Badge tooltip is `title`-only (not touch/keyboard accessible) | Minor | Affordance | `EvidenceScoreBadge.tsx:27` | High |

## Overall Assessment

The visual/layout posture of this change is solid. The title-row flex restructure is correctly done (`min-w-0` + `shrink-0` + `break-words`), focus indicators were added to every touched control, and the Score button has complete interactive-state coverage with a persistent, label-updating affordance — all directly aligned with the project guidelines. No Critical or Major issues. The four findings are all Minor and fixable in place; none indicate a structural problem. The single most important item is **Finding 3** (bump the interactive Score button to `text-xs` with adequate vertical padding to clear the WCAG 2.5.8 target-size floor and match the sibling `FindEvidenceButton`), since it is the one new *interactive* element undershooting the project's own §6 minimum. Finding 2 (cap the red-flag list) is the next most worthwhile as cheap defense against unbounded LLM output.

## Goal-Alignment Note
- Answered: yes — full mechanical UI review of the four evidence-scoring files, report saved to `docs/reviews/ui-visual-review.md`
- Out of scope: affordance item 6 and responsive item 7 (full-audit only; mechanical mode ran 1–5 + 8 per orchestrator); non-UI files (API route, hooks, store, types) read only for rendering context
- Escalate: nothing — all findings are Minor and in-place fixable; no blockers for opening the PR
- Questions I would have asked: omitted (scope was unambiguous)
