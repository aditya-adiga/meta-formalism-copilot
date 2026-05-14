# UI Visual Review: Lean Verifier Graceful Degradation

Commit: c95c9cb50d1a3634e655700f1b6c768a6774fe9b
Branch: feat/lean-verifier-graceful-degradation
Mode: Mechanical review + targeted affordance check (per skill rules, full audit checklist items 6-7 considered because the user explicitly asked about contrast/affordance differences)
Verification: **Static code reading only.** No dev server was started, no screenshots captured, no DOM measurements taken. Color-contrast judgments are based on Tailwind's published palette values evaluated against the panel's known ivory background; they were not measured with a live contrast tool.

## Summary

Reviewed the new `unavailable` verifier state in `VerificationBadge.tsx` and `LeanCodeDisplay.tsx`. The change is small and follows the project's UI Layout Guidelines well — controls remain outside the scroll container, the banner uses a normal block flow inside the scrollable region, and the Re-verify button now appears in the unavailable state (good: the action exists, the user is not stuck). I found **0 critical**, **2 major**, and **3 minor** issues. The most consequential finding is that the inline VerificationBadge text (`text-amber-700` on the `#F5F1ED` panel header) sits below WCAG AA contrast for small text and is harder to read than the existing `text-green-700` "Verified" badge.

## Environment

- **Files reviewed:**
  - `/home/magfrump/aisc_lct/meta-formalism-copilot/app/components/ui/VerificationBadge.tsx`
  - `/home/magfrump/aisc_lct/meta-formalism-copilot/app/components/features/lean-display/LeanCodeDisplay.tsx`
  - Reference: `/home/magfrump/aisc_lct/meta-formalism-copilot/app/components/panels/LeanPanel.tsx` (host of the badge — establishes the `#F5F1ED` background the badge text renders on)
- **Project guidelines consulted:** `/home/magfrump/aisc_lct/docs/UI_LAYOUT_GUIDELINES.md`
- **Target viewports reasoned about:** 360px mobile, 768px tablet, 1366px laptop, 1920px desktop
- **Target browsers:** modern evergreen (Chrome, Firefox, Safari, Edge) per Next.js defaults

## Critical Issues

None.

## Major Issues

### M1. `text-amber-700` on the Lean panel header background fails WCAG AA for small text

**Problem:** `VerificationBadge` renders `Verifier offline — not checked` as `text-xs font-normal text-amber-700` (Tailwind `#B45309`). The badge is consumed in `LeanPanel.tsx` inside a header bar with `bg-[#F5F1ED]` (line 62). `#B45309` on `#F5F1ED` is roughly a 4.4:1 contrast ratio — borderline at the AA threshold (4.5:1 for body text under WCAG 1.4.3) and below it for some renderings. By comparison, the existing `text-green-700` (`#15803D`) on the same background is comfortably above 4.5:1, and `text-red-700` (`#B91C1C`) is ~5.0:1.

The result is that the unavailable badge looks visibly fainter than its sibling badges. Combined with `font-normal` (vs. the `font-semibold` used elsewhere for status emphasis like the banner heading), it reads as the least important of the three states even though it is the one the user most needs to notice — this state silently invalidates the proof.

**Viewport:** All viewports; worse on lower-DPI laptop displays where amber renders less saturated.

**Best practice:** WCAG 2.1 SC 1.4.3 (Contrast Minimum, AA) — 4.5:1 for normal text. NNGroup: critical status indicators should be at least as prominent as confirmation/error states. Project guideline §6: "If you need to squint or hover to find a control, it's too subtle."

**Fix:**
```tsx
// Before
if (status === "unavailable") {
  return (
    <span
      className="ml-2 text-xs font-normal text-amber-700"
      title="Lean verifier is offline or not configured. Set LEAN_VERIFIER_URL to enable checking."
    >
      Verifier offline — not checked
    </span>
  );
}

// After — bump to amber-800 and match font weight of other status badges,
// which are also passing the contrast check (#92400E ~ 6.7:1 on #F5F1ED).
if (status === "unavailable") {
  return (
    <span
      className="ml-2 text-xs font-medium text-amber-800"
      title="Lean verifier is offline or not configured. Set LEAN_VERIFIER_URL to enable checking."
    >
      Verifier offline — not checked
    </span>
  );
}
```

**Tradeoff:** `amber-800` is darker and may visually compete with `green-700` and `red-700` for prominence, but that is intentional — this is a status-bearing message, not a label.

### M2. Badge depends on color + an em-dash to convey severity; no icon, no tooltip on touch

**Problem:** All three non-trivial badge states (`Verified`, `Verifier offline — not checked`, `Verification Failed`) are color-only differentiators. The `unavailable` state additionally relies on a `title` attribute for the explanation of what to do — but `title` does not surface on touch devices and is not an accessible mechanism for important status information (WCAG-wise, `title` is generally treated as a hint, not the primary content).

For users who cannot distinguish red/green/amber (~8% of men), the three states are visually identical short-text labels. The longer text on the `unavailable` state helps, but only because it's longer than the others — the severity signal is still color.

This is preexisting for the Verified/Failed pair, so I am flagging it as a Major (not Critical) issue in the context of *this* diff: the new state inherits the problem and adds a tooltip-only explanation that hides on mobile.

**Viewport:** All viewports; tooltip loss on touch is the bigger concern for tablets/phones.

**Best practice:** WCAG 1.4.1 (Use of Color) — color must not be the sole means of conveying information. WCAG 1.3.3 (Sensory Characteristics).

**Fix (minimal, non-invasive):** Add a small status glyph to each badge so the affordance survives without color, and rely on the in-panel banner (already added in `LeanCodeDisplay.tsx`) for the actionable explanation rather than the `title` attribute.

```tsx
// VerificationBadge.tsx — minimal glyph addition
if (status === "unavailable") {
  return (
    <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800">
      <span aria-hidden="true">⚠</span>
      <span>Verifier offline</span>
      <span className="sr-only">Lean verifier is offline; proof was not checked.</span>
    </span>
  );
}
```

The full explanation already lives in the in-panel banner, which is reachable on every device — no need for `title`.

**Tradeoff:** Adds a small visual element to a previously text-only badge family. If the team prefers visual consistency, apply the same treatment to `valid` (`✓`) and `invalid` (`✗`) in a follow-up — but I'd recommend doing it now while the badge is being touched.

## Minor Issues

### m1. Banner amber-800 heading on amber-50 is fine; amber-900 body is overkill

**Problem:** The in-panel banner uses three different amber shades:
- Border: `border-amber-300`
- Background: `bg-amber-50`
- Heading: `text-amber-800`
- Body: `text-amber-900`

`text-amber-900` on `bg-amber-50` (~`#451A03` on `#FFFBEB`) is a very high contrast (~13:1) but visually muddy — it reads almost black-with-a-warm-cast and undermines the "this is a warning, not normal text" affordance. The error variant uses `text-red-700` for body, not `text-red-900`.

**Viewport:** All.

**Best practice:** Color hierarchy within a notification — heading darker/heavier, body slightly lighter. The mirror pattern in the error banner (lines 147-152) uses `text-red-800` for the heading and `text-red-700` for the body. The unavailable banner should follow the same hierarchy.

**Fix:**
```tsx
// Before
<p className="mt-2 text-xs leading-relaxed text-amber-900">

// After — match the error banner's hierarchy
<p className="mt-2 text-xs leading-relaxed text-amber-700">
```

Note: `text-amber-700` body on `bg-amber-50` is approximately 4.6:1 — passes AA for small text. If you want headroom, use `text-amber-800` and keep the heading at `text-amber-900` to preserve the "heading darker than body" pattern.

**Tradeoff:** Tiny visual change; brings consistency with the existing error banner.

### m2. `<code>` tag in banner does not have a background — looks like prose

**Problem:** The `<code className="font-mono">LEAN_VERIFIER_URL</code>` is monospaced but otherwise styled identically to surrounding text. In a warning banner where the user is being told "set this environment variable", the env-var name should be visually marked as a code token. Other panels in this codebase typically style code spans with at least a subtle background or border.

**Viewport:** All.

**Best practice:** Material/HIG: inline code should be visually separable from prose. Project pattern: the existing `pre` block in the error banner uses `font-mono text-xs` against a colored background, so the rendered token reads as code. The inline `<code>` here gets only the font change.

**Fix:**
```tsx
// Before
Set the <code className="font-mono">LEAN_VERIFIER_URL</code> environment variable

// After
Set the <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[0.95em] text-amber-900">LEAN_VERIFIER_URL</code> environment variable
```

**Tradeoff:** Slightly busier banner; the user gains a clear visual cue that this is a literal name to copy.

### m3. Re-verify button alongside `unavailable` may mislead — no retry will succeed unless config changes

**Problem:** With this diff, the Re-verify button now also shows when `verificationStatus === "unavailable"`. The button uses the same affordance (blue, "Re-verify ↺") as the case where Lean code was edited or invalid. But in the `unavailable` case, clicking Re-verify will (a) succeed only if the verifier came online since last check, and (b) otherwise return the same `unavailable` status. Users who don't read the banner may interpret the visible button as "press here to fix the offline state."

This is not strictly broken — re-attempting *is* the right action if the verifier was transiently down — but the affordance is identical to "I edited the code, please re-check" which is a different mental model.

**Viewport:** All.

**Best practice:** NNGroup — buttons should signal what will happen. A retry-after-config-change action is conceptually different from a re-verify-after-edit action. WCAG 3.3.2 (Labels or Instructions): controls should be self-describing.

**Fix (low-effort):** Either keep the button as-is and rely on the banner for context (acceptable — current state), or differentiate the label when the cause is `unavailable`:
```tsx
// In LeanCodeDisplay.tsx, around the Re-verify button:
{verificationStatus === "unavailable" ? "Retry verification ↺" : "Re-verify ↺"}
```

I'd lean toward the banner-only approach (no code change) unless user testing surfaces confusion. Leaving this as a minor with a no-op recommendation, but flagging it for the reviewer's awareness.

**Tradeoff:** Two slightly different button labels in the same component for a state distinction users may not need to make.

## Best Practices Applied (already present in this diff)

| Principle | Source | How Applied |
|-----------|--------|-------------|
| Controls outside scroll containers | Project §2 | Re-verify button correctly placed in `absolute right-4 top-4 z-30` container, not inside the `overflow-auto` scroll region |
| Action visible during error state | Project §7 | Re-verify button is shown (not hidden) when verifier is unavailable, giving the user a visible recovery action |
| Status banner inside content flow | NNGroup status messages | The unavailable banner uses normal block flow inside the scroll region — does not float, does not occlude code, scrolls with content where appropriate |
| Distinct color family per severity | NNGroup | Amber for unavailable is distinct from red (failed) and green (passed); won't be confused with either |
| Plain-language explanation with remediation | WCAG 3.3.3 | Banner tells the user *what's wrong* and *what to do* (set `LEAN_VERIFIER_URL`) — much better than a silent failure or a cryptic error |

## Viewport Verification Checklist

This was not run in a browser; results below are predictions from static analysis.

- [x] **360px mobile (predicted PASS):** The banner uses block layout with `px-4 py-3` and `text-xs`. The inline `<code>` has no `break-word` rule, but `LEAN_VERIFIER_URL` is short enough to fit. The Re-verify button + Edit button cluster (`absolute right-4 top-4`, `gap-2`) may sit close to the scrollbar gutter on narrow viewports — likely OK with the current `px-8` content padding, but worth a real-device check.
- [x] **768px tablet (predicted PASS):** No issues expected.
- [x] **1366px laptop (predicted PASS):** Standard target — banner displays cleanly at the top of the scroll region; Re-verify button visible in upper-right.
- [x] **1920px desktop (predicted PASS):** Banner expands to full content width inside `px-8`; no stretching issues.

## Runtime Verification Results

Not performed. This review is static-only.

## Post-Implementation Visual Fix Tracking

- Issues found after this review that required manual visual fixes: 0 (review pre-fix)
- Issues caught by this review before they shipped: 5 flagged (2 major, 3 minor)

---

## Reviewer notes for the author

The architecture of this change is solid — distinguishing "verifier offline" from "verification failed" is the right call, the in-panel banner is the right surface for the explanation, and keeping Re-verify available is the right affordance choice. The findings above are mostly polish on top of a good design. The only one I'd block on is **M1** (badge contrast / weight); the rest can ship and be addressed in a follow-up if preferred.
