# UI Visual Review — Input / Context Panel (`InputPanel` + `FormalizationControls`)

**Scope:** `InputPanel` and its context/generate section, plus the `context-input/` siblings (`ContextInput`, `RefinementButtons`, `RefinementPreview`) and the embedded `ArtifactChipSelector`.
**Date:** 2026-05-21
**Based on:** project-local `docs/UI_LAYOUT_GUIDELINES.md` (primary authority)

## Environment

- **Files reviewed:**
  - `app/components/panels/InputPanel.tsx`
  - `app/components/features/formalization-controls/FormalizationControls.tsx`
  - `app/components/features/context-input/ContextInput.tsx`
  - `app/components/features/context-input/RefinementButtons.tsx`
  - `app/components/features/context-input/RefinementPreview.tsx`
  - `app/components/features/artifact-selector/ArtifactChipSelector.tsx`
- **Target viewports:** 360px mobile, 1366×768 laptop, 1920×1080 desktop (per guideline #5/#7; guideline mandates correctness at `1024×768` minimum)
- **Target browsers / platforms:** modern evergreen + mobile Safari
- **Review mode:** Full audit (user requested a review of the panel)

> **Note on the two context inputs.** The panel labelled "input context" actually renders **`FormalizationControls`** (via `InputPanel`), *not* the `ContextInput` component. `ContextInput` (used elsewhere) implements the docked-footer pattern correctly; `FormalizationControls` does not, and that is the central finding below.

---

## Findings

#### Generate button and lower chips clip off-screen at constrained heights

**Severity:** Critical
**Location:** `app/components/panels/InputPanel.tsx:83-104`, `app/components/features/formalization-controls/FormalizationControls.tsx:56-104`
**Issue type:** Overflow
**Viewport:** All heights ≤ ~900px; guaranteed at 1366×768 and 360px
**Move:** Step 2 item 1 (unbounded content without scroll cap) + item 2 (controls trapped/clipped); guideline #1 and #2
**Confidence:** High

`InputPanel`'s bottom section is `flex min-h-0 flex-1 flex-col overflow-hidden` and places `FormalizationControls` directly inside it. But `FormalizationControls`' root is `flex shrink-0 flex-col` (line 57) and its content region `flex flex-col gap-3 p-4` (line 58) has **no height cap and no `overflow-auto`**. Because the component is `shrink-0`, it refuses to shrink; its natural height is the textarea (`rows={6}`, ~187px) + the "Output Types" block + the full `ArtifactChipSelector` (description, wrapping chip row, "Browse types" link, **and a `<ul>` that lists a description for every selectable type** — `ArtifactChipSelector.tsx:165-179`) + the docked Generate button. At 768px panel height the source section can occupy up to 50% (`max-h-[50%]`), leaving ~350px for this section while its natural height is ~540px. The overflow is swallowed by the parent's `overflow-hidden`, and since the Generate button is the last element, **it is clipped entirely** — the user cannot start a generation. Adding custom artifact types makes this worse (more chips + longer description list).

This is the exact regression guideline #2 was written to prevent. The sibling `ContextInput` (`ContextInput.tsx:65-111`) does it correctly: fill-and-scroll wrapper (`flex flex-1 min-h-0 ... overflow-auto`) with the action button in a `shrink-0` docked footer.

**Recommendation:** `FormalizationControls` is also used in `NodeDetailPanel.tsx:149` where it sits inside an already-`shrink-0` docked footer below a scroll region — so do **not** change its root globally. Fix it at the `InputPanel` call site by giving the section a scroll layer and pinning the header:

```tsx
// InputPanel.tsx — bottom section
// BEFORE
<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
  <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-4 py-2">
    <h2 className="...">Generate Analysis</h2>
  </div>
  <FormalizationControls ... />
</div>

// AFTER
<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
  <div className="shrink-0 border-b border-[#DDD9D5] bg-[#F5F1ED] px-4 py-2">
    <h2 className="...">Generate Analysis</h2>
  </div>
  <div className="flex-1 min-h-0 overflow-auto">
    <FormalizationControls ... />
  </div>
</div>
```

This guarantees the Generate button is always reachable (it scrolls into view). **Tradeoff:** the button is no longer pinned to the panel bottom in `InputPanel` — it scrolls with the content. If a pinned button is required, the cleaner long-term fix is a `FormalizationControls` variant whose content region is `flex-1 min-h-0 overflow-auto` and whose footer stays `shrink-0`, with the parent supplying `flex-1 min-h-0` instead of the component being `shrink-0` (preserving the `NodeDetailPanel` docked usage via a prop).

---

#### Interactive text controls have no keyboard focus indicator

**Severity:** Major
**Location:** `ArtifactChipSelector.tsx:107-113` ("Click here to learn…"), `:140-154` ("+ Custom"), `:157-163` ("Browse types →"); `ArtifactChip` `:31-48`
**Issue type:** Focus
**Viewport:** All
**Move:** Step 2 item 6 + item 8 (focus state); guideline #6; WCAG 2.4.7
**Confidence:** High

These four interactive elements define only `hover:` styling and no `focus-visible` indicator. The inline "Click here to learn about different formalisms" button and "Browse types →" link rely on `hover:text-...` alone. The artifact chips (`ArtifactChip`) and the "+ Custom" button likewise have no focus ring and no `:active` press state. Keyboard users cannot tell which control is focused (WCAG 2.4.7). The primary buttons in this panel *do* have `focus:ring-2` — these secondary controls were missed.

**Recommendation:** Add a focus ring consistent with the rest of the panel.

```tsx
// ArtifactChip — add to the className template
focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)] focus-visible:ring-offset-1
// also expose selection state to AT:
aria-pressed={isActive}

// "+ Custom", "Browse types →", "Click here…" — append
focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-black)] focus-visible:ring-offset-1 rounded-sm
```

---

#### "+ Custom" button text fails WCAG AA contrast

**Severity:** Major
**Location:** `ArtifactChipSelector.tsx:145-150`
**Issue type:** Affordance
**Viewport:** All
**Move:** Step 2 item 6; guideline #6; WCAG 1.4.3 / 1.4.11
**Confidence:** High

The "+ Custom" button uses `text-[#9A9590]` and `border-[#9A9590]` as its resting state. Measured contrast of `#9A9590` is **2.97:1 on white** and **2.64:1 on the `#F5F1ED` header tint** — below the 4.5:1 AA threshold for text and below the 3:1 threshold for UI component boundaries. It is a real, persistently-visible control (not placeholder text), so the resting color must meet contrast. The same `#9A9590` is used for textarea placeholders (`ContextInput.tsx:78`, `FormalizationControls.tsx:64`) — placeholders are more lenient, but the active control is not.

**Recommendation:** Darken the resting text/border to at least `#6B6560` (5.7:1 on white) or, per guideline #6, `#4A4540` (9.5:1):

```tsx
// BEFORE
border-dashed border-[#9A9590] text-[#9A9590] hover:border-[var(--ink-black)] hover:text-[var(--ink-black)]
// AFTER
border-dashed border-[#6B6560] text-[#4A4540] hover:border-[var(--ink-black)] hover:text-[var(--ink-black)]
```

---

#### Helper/secondary text uses `#6B6560`, lighter than the project guideline mandates

**Status:** Fixed — in-scope panel sites (`ContextInput` status text, `RefinementButtons`, `RefinementPreview` labels, `ArtifactChipSelector` description + inline link) swept to `#4A4540`. `FormalizationControls` heading and `ContextInput` description were already `#4A4540` on `main`. The `ArtifactTypeModal` / `CustomTypeDesigner` modal sites are out of this review's scope and left unchanged.
**Severity:** Minor
**Location:** `ContextInput.tsx:69,83`; `FormalizationControls.tsx:70`; `ArtifactChipSelector.tsx:105,110`; `RefinementButtons.tsx:15`; `RefinementPreview.tsx:16,21,32`
**Issue type:** Affordance
**Viewport:** All
**Move:** Guideline #6
**Confidence:** High

Guideline #6 explicitly mandates `text-[#4A4540]` for helper/secondary text and names `#6B6560` "or lighter" as too light. These usages pass WCAG AA (`#6B6560` measures 5.1–5.7:1 across the panel's backgrounds), so this is a **project-consistency** deviation, not an accessibility failure. The description paragraph in `ContextInput` and the "Output Types" heading are the most prominent instances.

**Recommendation:** Swap `text-[#6B6560]` → `text-[#4A4540]` on these labels to match the guideline. Low risk; purely a darkening.

---

#### Section headers lack `shrink-0`

**Severity:** Minor
**Location:** `InputPanel.tsx:57` ("Source Inputs") and `:84` ("Generate Analysis")
**Issue type:** Sizing
**Viewport:** Constrained heights
**Move:** Step 2 item 3; guideline #4
**Confidence:** Medium

Both section-header bars are flex children of capped/`flex` columns without `shrink-0`. They are currently protected from collapse only by intrinsic `min-height: auto`, so they mostly hold — but guideline #4 calls for fixed bars to be explicit. Adding `shrink-0` removes the ambiguity (and is part of the Critical fix above for the bottom header).

**Recommendation:** Add `shrink-0` to both header `<div>`s.

---

#### Textarea default rows exceed the compact-spacing guideline

**Severity:** Minor
**Location:** `ContextInput.tsx:77` (`rows={10}`), `FormalizationControls.tsx:63` (`rows={6}`)
**Issue type:** Sizing
**Viewport:** ≤ 768px height
**Move:** Step 2 item 5; guideline #5 (prefer `rows={3}`–`{5}`)
**Confidence:** Medium

`ContextInput`'s `rows={10}` is mitigated because that textarea is `flex-1 min-h-0` and flexes to available space, so the attribute is mostly an initial hint. `FormalizationControls`' `rows={6}` is *not* flexed — it contributes a fixed ~187px, which feeds the Critical overflow above. Reducing it to `rows={4}` reclaims ~50px of the deficit.

**Recommendation:** Set `FormalizationControls` textarea to `rows={4}`. Leave `ContextInput` as-is or lower to `rows={6}` for consistency.

---

#### `RefinementPreview` "Insert" button overlaps the bottom of the refined-text scroll area

**Status:** Fixed — added `pb-10` to the refined-text scroll region so the absolute Insert button no longer obscures the last line.
**Severity:** Minor
**Location:** `RefinementPreview.tsx:31-46`
**Issue type:** Positioning
**Viewport:** All, when refined text is long
**Move:** Step 2 item 4 (absolute positioning); guideline #3
**Confidence:** High

The "Insert" button is `absolute bottom-3 right-3` inside the (correctly `relative`) "Refined" box — anchoring is right. But the scrollable text region (`min-h-0 flex-1 overflow-auto`, line 33) has no bottom padding, so when the refined text fills the box the button floats over the last line, obscuring it.

**Recommendation:** Add bottom padding to the scroll region to clear the button: `className="min-h-0 flex-1 overflow-auto pb-10 text-sm ..."`.

---

#### Decompose action sits inside the source scroll container

**Severity:** Informational
**Location:** `InputPanel.tsx:67-78`
**Issue type:** Affordance
**Viewport:** Constrained heights
**Move:** Guideline #2
**Confidence:** Medium

The "Break down into parts" button is inside the `overflow-auto` source-inputs region, so it scrolls with content rather than staying docked. Unlike the primary Generate action, this is a content-scoped secondary action that logically belongs with the source text, so scrolling-with-content is defensible. Noting it for awareness; no change required unless it tests poorly.

---

## What Looks Good

- **`ContextInput` is the reference implementation** of the docked-footer pattern (guideline #2): `flex flex-1 min-h-0 overflow-hidden` wrapper, scrollable content, `shrink-0` footer button. Use it as the template for the `FormalizationControls`-in-`InputPanel` fix.
- **Source-inputs section** correctly caps growth with `max-h-[50%] min-h-0 overflow-hidden` and an inner `overflow-auto` (guideline #1).
- **`RefinementPreview`** correctly anchors its absolute "Insert" button to the `relative` "Refined" box (guideline #3) and pins "Cancel" as a `shrink-0` footer.
- **Primary/secondary buttons** (Generate, Decompose, Refine chips, Insert, Cancel) all have visible borders/fills and proper `focus:ring-*` indicators with offset.
- **Disabled states** use `disabled:opacity-50` consistently and disable the relevant handlers (`loading`/`refining`/empty-selection guards).
- **Compact padding** (`p-4`, `gap-3`) is used in `InputPanel` per guideline #5.

## Best Practices Applied

| Principle | Source | How Applied (in the existing good code) |
|-----------|--------|------------------------------------------|
| Cap unbounded content + scroll | guideline #1, NNGroup | Source section `max-h-[50%] overflow-auto` |
| Controls outside scroll container | guideline #2 | `ContextInput` docked footer button |
| Correct absolute anchoring | guideline #3, MDN | `RefinementPreview` Insert button in `relative` box |
| Visible focus indicators | WCAG 2.4.7 | `focus:ring-2` on all primary buttons |
| Compact vertical spacing | guideline #5 | `p-4` / `gap-3` throughout `InputPanel` |

## Keyboard Navigation

This diff/scope **is in scope** for keyboard review (textareas, buttons, chips, links).

**Focus order.** DOM order matches visible reading order top-to-bottom:
1. Source textarea (`TextInput`)
2. File upload control (`FileUpload`)
3. "Break down into parts" (`InputPanel.tsx:69`)
4. Context textarea (`FormalizationControls.tsx:59`)
5. "Click here to learn…" (`ArtifactChipSelector.tsx:107`)
6. Artifact chips, in order (`ArtifactChipSelector.tsx:117`)
7. Custom-type chips, then "+ Custom" (`:128`, `:140`)
8. "Browse types →" (`:157`)
9. Generate button (`FormalizationControls.tsx:94`)

No `order`/`row-reverse`/absolute reordering is used in the panel, so visual and tab order agree — no WCAG 2.4.3 violation. **Caveat:** per the Critical finding, the Generate button (last in tab order) is currently *clipped* at common heights; a keyboard user can Tab to it but it is not visible until that overflow is fixed.

**Escape-key behavior.** `N/A for the panel itself` — `InputPanel`/`FormalizationControls` open no modals directly. The chip selector launches `ArtifactTypeModal` and `CustomTypeDesigner` (out of this scope); their Escape handling should be verified separately when those components are reviewed.

**Skip-link presence.** `N/A — diff does not change page-level landmarks` (this is a panel within the existing `PanelShell` structure).

**Focus-trap risks.** No focus-trap risks identified within the panel. (Modal trapping for the chip-selector modals is out of scope.)

## Viewport Verification Checklist

- [ ] 360px mobile: context section reachable, Generate button reachable (blocked by Critical finding today)
- [ ] 1366×768 laptop: Generate button visible without the panel clipping it (blocked by Critical finding today)
- [ ] 1920×1080 desktop: layout fills space; source section capped at 50% does not leave excessive whitespace

## Summary Table

| # | Finding | Severity | Issue type | Location | Confidence |
|---|---------|----------|------------|----------|------------|
| 1 | Generate button/chips clip off-screen | Critical | Overflow | `InputPanel.tsx:83-104` | High |
| 2 | Secondary controls lack focus indicator | Major | Focus | `ArtifactChipSelector.tsx:107,140,157`; chip `:31` | High |
| 3 | "+ Custom" text fails AA contrast (2.97:1) | Major | Affordance | `ArtifactChipSelector.tsx:145` | High |
| 4 | Helper text `#6B6560` lighter than guideline | Minor | Affordance | multiple | High |
| 5 | Section headers lack `shrink-0` | Minor | Sizing | `InputPanel.tsx:57,84` | Medium |
| 6 | Textarea `rows` exceed compact guideline | Minor | Sizing | `FormalizationControls.tsx:63`; `ContextInput.tsx:77` | Medium |
| 7 | Insert button overlaps refined-text scroll | Minor | Positioning | `RefinementPreview.tsx:31-46` | High |
| 8 | Decompose button inside scroll container | Informational | Affordance | `InputPanel.tsx:67-78` | Medium |

## Overall Assessment

The panel's layout posture is mostly sound — the source section is capped correctly and `ContextInput` is a textbook docked-footer implementation. The one structural problem is significant: `FormalizationControls` was written as a *size-to-content, dock-at-bottom-of-a-scroll-parent* component (correct for its `NodeDetailPanel` usage), but `InputPanel` drops it into a fixed `flex-1 overflow-hidden` slot expecting it to manage its own scrolling, which it doesn't. The result is that the **Generate button — the primary action of the whole panel — clips off-screen at any height ≤ ~900px**, which includes the guideline's mandated `1024×768` minimum. The single most important thing to address is wrapping `FormalizationControls` in a scroll layer at the `InputPanel` call site (Finding 1); it is a small, in-place change that does not disturb the `NodeDetailPanel` usage. The Major focus/contrast issues (Findings 2–3) are quick className additions and worth bundling into the same fix.
