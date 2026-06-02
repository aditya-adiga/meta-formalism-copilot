# UI Visual Review — integration/5.21 evidence-search merge (PRs #110, #119, #125–128)

**Scope:** Net-new UI introduced into `integration/5.21` vs `main` — the evidence-search feature components, the shared `ArtifactPanelShell` staleness banner, and the counterexample classification badges. Renames and text-only (layman-language) changes were scanned but carry no layout risk and are not itemized.
**Date:** 2026-05-21
**Note:** A separate `ui-visual-review.md` in this directory covers the earlier Custom Artifact Types feature (different scope) and is left intact.

## Environment

- **Files reviewed:**
  - `app/components/features/evidence-search/EvidenceResultsSection.tsx`
  - `app/components/features/evidence-search/EvidencePaperCard.tsx`
  - `app/components/features/evidence-search/EvidenceScoreBadge.tsx`
  - `app/components/features/evidence-search/FindEvidenceButton.tsx`
  - `app/components/features/evidence-search/IntegrationProposalCard.tsx`
  - `app/components/features/evidence-search/IntegrationProposalsSection.tsx`
  - `app/components/features/evidence-search/OverlapSummary.tsx`
  - `app/components/panels/ArtifactPanelShell.tsx`
  - `app/components/panels/CounterexamplesPanel.tsx`
- **Target viewports:** 360px mobile, 1366×768 laptop, 1920×1080 desktop. Note: panels render in a `flex-1` focus pane (`PanelShell.tsx:21`) that can be ~half-width in a horizontal split, so cards must survive narrow widths.
- **Target browsers / platforms:** modern evergreen browsers + mobile Safari.
- **Review mode:** Mechanical (checklist items 1–5, 8). No project-local UI layout guidelines exist (`docs/` has only `USER_GUIDE.md` / `MAINTAINING_USER_GUIDE.md`), so the skill's defaults apply.

## Findings

#### Title flex item lacks `min-w-0`, risking horizontal overflow in narrow panels

**Severity:** Minor
**Location:** `app/components/features/evidence-search/EvidencePaperCard.tsx:43-52`
**Issue type:** Overflow
**Viewport:** narrow split panes and 360px mobile
**Move:** Step 2 item 1 (unbounded content) + item 4 (flex sizing)
**Confidence:** Medium

The title row is `flex items-start justify-between gap-2` with the title `<div>` as a flex child that has no `min-w-0`. Flex items default to `min-width: auto`, so the title cannot shrink below the width of its longest unbreakable token. Ordinary paper titles wrap at spaces and are fine, but a title containing a long unbroken token (a URL, DOI fragment, or long identifier string) will force the row wider than the panel and produce horizontal overflow, pushing the `shrink-0` badge cluster off-screen. This is the classic flex-overflow trap.

**Recommendation:** Add `min-w-0` to the title container and `break-words` to the link/text so long tokens wrap instead of overflowing.

```tsx
// before
<div className="text-sm font-medium text-[var(--ink-black)]">
  {url ? <a href={url} ... className="hover:underline">{paper.title}</a> : paper.title}

// after
<div className="min-w-0 text-sm font-medium text-[var(--ink-black)]">
  {url ? <a href={url} ... className="break-words hover:underline">{paper.title}</a> : paper.title}
```

#### Proposal-card header label can crowd the edit-type badge

**Severity:** Minor
**Location:** `app/components/features/evidence-search/IntegrationProposalCard.tsx:34-41`
**Issue type:** Overflow
**Viewport:** narrow split panes and 360px mobile
**Move:** Step 2 item 4 (flex sizing)
**Confidence:** Medium

`flex items-center justify-between gap-2` holds a `fieldLabel` span (no `min-w-0`) next to the edit-type badge span (no `shrink-0`). A long `fieldLabel` will either compress the badge text or, with an unbreakable token, overflow. The badge text ("Update prior", "Contradiction", etc.) should never wrap or compress.

**Recommendation:** Give the label `min-w-0 truncate` (or `break-words`) and mark the badge `shrink-0`.

```tsx
<span className="min-w-0 truncate text-sm font-medium text-[var(--ink-black)]">{proposal.fieldLabel}</span>
<span className="shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-mono ${editStyle.className}">{editStyle.label}</span>
```

#### New evidence buttons omit explicit focus/active states used elsewhere in the codebase

**Severity:** Minor
**Location:** `EvidenceResultsSection.tsx:68,86,101`; `FindEvidenceButton.tsx:51,81`; `IntegrationProposalCard.tsx:76,83`; `IntegrationProposalsSection.tsx:35,62`; `EvidencePaperCard.tsx:122`
**Issue type:** State coverage
**Viewport:** all
**Move:** Step 2 item 8 (interactive element state matrix)
**Confidence:** High

The new buttons define `default` and `hover` (and `disabled` where applicable) but no explicit `focus-visible` ring and no `:active` style. This is **not** a WCAG 2.4.7 violation on its own — there is no global `outline: none` reset in `globals.css`, so browser-default focus rings still render. But the codebase has an established convention of explicit focus styling (`RefinementButtons.tsx`, `FormalizationControls.tsx`, `WholeTextEditBar.tsx`, and others use `focus:ring`/`focus-visible`). The new components break that convention, so keyboard focus is less prominent here than in sibling controls, and clicks have no pressed-state feedback.

**Recommendation:** Add a `focus-visible` ring and a light `active:` shift to match the existing button convention. Example for the bordered evidence buttons:

```tsx
className="... border border-[#DDD9D5] rounded-md px-2 py-0.5 hover:bg-[#F5F1ED]
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)]/30
           active:bg-[#ECE7E2] disabled:opacity-50 disabled:cursor-wait"
```

#### Score/overlap rationale is reachable only via the native `title` tooltip

**Severity:** Informational
**Location:** `EvidenceScoreBadge.tsx:30-33`; `EvidencePaperCard.tsx:70-79`
**Issue type:** Affordance
**Viewport:** all (touch + keyboard especially)
**Move:** Step 2 item 6 (affordance — noted; full-audit territory)
**Confidence:** High

The reliability/relatedness rationale and the "Included in: …" review title are exposed only through the HTML `title` attribute. `title` tooltips do not appear on touch devices and are not reliably reachable by keyboard, so the rationale — arguably the most useful part of the score — is invisible to a large share of users. Flagged as informational since it is an affordance concern outside the default mechanical scope, but worth a follow-up.

**Recommendation:** Consider a tap/click-to-expand popover or an inline expandable rationale (consistent with the existing "Show more" abstract pattern in `EvidencePaperCard`) rather than relying on `title`.

## What Looks Good

- **`ArtifactPanelShell` scroll structure is correct.** The content area is `flex-1 overflow-y-auto` inside a `min-h-0 flex-1 flex-col overflow-hidden` wrapper (`ArtifactPanelShell.tsx:111-114`), and the `WholeTextEditBar` is a docked sibling *outside* the scroll region (`:115`) — the correct docked-footer pattern (Step 2 item 2). Evidence controls intentionally live inside the scroll area because they are content-contextual, not global actions.
- **Staleness banner is pinned, not scrolled.** It sits between the header and the scroll container (`ArtifactPanelShell.tsx:91-104`), so it stays visible. `shrink-0`/`flex-1` roles throughout the shell are used correctly (Step 2 item 3).
- **Edit-progress banner is anchored correctly.** `absolute inset-x-0 top-0 z-40` resolves against the `relative` shell root (`ArtifactPanelShell.tsx:73,76`), not a stray ancestor (Step 2 item 4).
- **Abstract truncation** caps long text at 200 chars with a Show more/less toggle (`EvidencePaperCard.tsx:116-130`) — good defense against unbounded content.
- **Disabled states are handled well** across the evidence buttons (`disabled:opacity-50 disabled:cursor-wait`), and the author line uses `flex flex-wrap` so metadata reflows (`EvidencePaperCard.tsx:84`).
- **CounterexamplesPanel badges** are non-interactive spans with adequate sizing; the empirical/logical classification degrades gracefully for legacy artifacts (`isEmpirical == null` → no badge).

## Best Practices Applied

| Principle | Source | How Applied |
|-----------|--------|-------------|
| Controls pinned outside scroll region | NNGroup (visible affordances) | `WholeTextEditBar` docked outside `overflow-y-auto` in `ArtifactPanelShell` |
| Bounded content with explicit overflow | WCAG 1.4.10 (reflow) | Panel content scrolls via `overflow-y-auto`; abstracts truncate with toggle |
| Metadata reflow on narrow widths | WCAG 1.4.10 | `flex flex-wrap` on the author/metadata row |
| Visible disabled state | WCAG / NNGroup | `disabled:opacity-50 disabled:cursor-wait` on async-action buttons |

## Keyboard Navigation

This diff is **in scope** — it adds many focusable buttons (evidence search/score/overlap toggles, integration approve/reject/apply, abstract show-more).

- **Focus order.** All new interactive elements are plain in-flow `<button>`s rendered top-to-bottom in DOM order matching visible order (search → results disclosure → score/overlap → paper cards → suggest-edits → proposals → apply). No `tabindex`, `order`, or `row-reverse` is used, so tab order follows visible reading order — no WCAG 2.4.3 issue found.
- **Escape-key behavior.** N/A — these are inline disclosure sections (`useState(open)`), not modals/overlays/popovers. No focus-managing regions are added or modified in this diff.
- **Skip-link presence.** N/A — diff does not change page-level landmarks (`<header>/<nav>/<main>/<aside>/<footer>`); it adds content inside existing panels.
- **Focus-trap risks.** No focus-trap risks identified. The collapsible sections hide content by conditional render (`{open && …}`), removing it from the tab path when closed rather than leaving it focusable off-screen.

One consistency note (see Finding 3): focus is satisfied by the browser default outline, but the new buttons lack the explicit `focus-visible` ring used by sibling controls.

## Viewport Verification Checklist

- [x] 360px mobile: content reachable and scrollable; **caveat** — long unbreakable tokens in titles/labels can overflow horizontally until `min-w-0`/`break-words` is added (Findings 1–2).
- [x] 1366×768 laptop: action buttons visible; evidence sections scroll within the panel; staleness banner and edit bar stay pinned.
- [x] 1920×1080 desktop: layout fills space without excessive whitespace; compact spacing (`px-3 py-2`, `space-y-2`) is appropriate.

## Summary Table

| # | Finding | Severity | Issue type | Location | Confidence |
|---|---------|----------|------------|----------|------------|
| 1 | Title flex item lacks `min-w-0` | Minor | Overflow | `EvidencePaperCard.tsx:43-52` | Medium |
| 2 | Proposal header label can crowd badge | Minor | Overflow | `IntegrationProposalCard.tsx:34-41` | Medium |
| 3 | New buttons omit explicit focus/active states | Minor | State coverage | evidence-search buttons (multiple) | High |
| 4 | Rationale only via `title` tooltip | Informational | Affordance | `EvidenceScoreBadge.tsx:30-33`, `EvidencePaperCard.tsx:70-79` | High |

## Overall Assessment

The merged UI is structurally sound: the shared `ArtifactPanelShell` gets the hard parts right (docked edit bar outside the scroll region, pinned staleness banner, correct `flex-1 min-h-0` / `shrink-0` roles, correctly anchored absolute banner), and the new evidence components follow a consistent compact card idiom. No Critical or Major layout bugs were found — nothing breaks the primary task at any tested viewport. The findings are all in-place hardening: two flex containers need `min-w-0`/`shrink-0` to be safe against long unbreakable tokens in narrow split panes, and the new buttons should pick up the codebase's existing `focus-visible`/`active` convention for keyboard-and-press consistency. The single most valuable follow-up is **adding `min-w-0` + `break-words` to the EvidencePaperCard title** (Finding 1), since that is the one place a real-world long token could push content off-screen.
