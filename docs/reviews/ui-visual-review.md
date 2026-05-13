# UI Visual Review: Custom Artifact Types

## Summary

The custom artifact type feature adds a modal designer (CustomTypeDesigner), chip selector extensions (ArtifactChipSelector), modal browse extensions (ArtifactTypeModal), and a generic panel renderer (CustomArtifactPanel). Layout is generally sound -- the new modal uses max-h with overflow-y-auto, and CustomArtifactPanel delegates to ArtifactPanelShell which already handles scroll correctly. One major issue: the CustomTypeDesigner modal's action buttons scroll away inside the overflow container.

## Environment
- **Files reviewed:** `CustomArtifactPanel.tsx`, `CustomTypeDesigner.tsx`, `ArtifactChipSelector.tsx`, `ArtifactTypeModal.tsx`, `FormalizationControls.tsx`, `InputPanel.tsx`, `PanelIcons.tsx`, `usePanelDefinitions.tsx`, `page.tsx`
- **Target viewports:** 360px mobile, 1366x768 laptop, 1920x1080 desktop

## Critical Issues

*None found.*

## Major Issues

### 1. CustomTypeDesigner: action buttons trapped inside scroll container

**Problem:** The entire modal body (header + form fields + action buttons) is wrapped in a single `max-h-[80vh] overflow-y-auto` div. When the "review" step is active, the form contains Name, Chip Label, Description, When to Use, Output Format, System Prompt (h-48), and a Refinement row -- easily exceeding 80vh on a 768px viewport. The "Back", "Test Preview", and "Save to Session" buttons at the bottom scroll out of view.

**Viewport:** 1366x768 and smaller.

**Fix:** Split the modal into a pinned header, scrollable body, and pinned footer.

```tsx
// Before (CustomTypeDesigner.tsx lines ~130-136):
<div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg bg-[var(--ivory-cream)] shadow-lg border border-[#DDD9D5]">
  {/* Header */}
  <div className="flex items-center justify-between border-b border-[#DDD9D5] px-6 py-4">...</div>
  <div className="px-6 py-4 space-y-4">
    {/* all form content + buttons mixed together */}
  </div>
</div>

// After:
<div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg bg-[var(--ivory-cream)] shadow-lg border border-[#DDD9D5]">
  {/* Header — shrink-0 */}
  <div className="shrink-0 flex items-center justify-between border-b border-[#DDD9D5] px-6 py-4">...</div>
  {/* Scrollable body — flex-1 min-h-0 overflow-y-auto */}
  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
    {/* form fields only */}
  </div>
  {/* Footer — shrink-0 */}
  <div className="shrink-0 border-t border-[#DDD9D5] px-6 py-3 flex justify-between">
    {/* Back / Test Preview / Save buttons */}
  </div>
</div>
```

**Tradeoff:** Requires extracting the step-specific action buttons out of the step-conditional blocks into a shared footer area, which adds a small amount of structural complexity.

## Minor Issues

### 2. ArtifactTypeModal: same scroll-trapping pattern (pre-existing, worsened)

**Problem:** The ArtifactTypeModal inner div was changed to `max-h-[80vh] overflow-y-auto` (good fix for unbounded content), but it has no pinned close button or footer. With many custom types added, the close button in the header scrolls away. This was arguably pre-existing but the addition of custom type cards makes it more likely to trigger.

**Viewport:** 768px with 3+ custom types.

**Fix:** Same two-layer split as above: pin the header with the close button outside the scroll region.

### 3. CustomArtifactPanel: recursive JSON rendering has no depth or size guard

**Problem:** `JsonSection` recurses into nested objects and arrays without limit. A deeply nested or very large JSON response from the LLM could produce an extremely tall DOM tree that is slow to render and hard to navigate. The outer `ArtifactPanelShell` has `overflow-y-auto` so it won't break layout, but UX degrades.

**Viewport:** All.

**Fix:** Add a max-depth parameter (e.g. 4 levels), rendering raw JSON in a `<pre>` block beyond that depth. Low priority since LLM output is typically shallow.

### 4. CustomArtifactIcon SVG path coordinates exceed viewBox

**Problem:** The `CustomArtifactIcon` has `viewBox="0 0 20 20"` but path coordinates go up to `22` (e.g., `h3` from x=8 reaches x=22, `H8` combined with `h3a2` etc.). The paths `M8 2h4v3a2 2 0 1 1 0 4v3h3a2 2 0 1 1 4 0h3v4H8V2z` contain relative moves that push beyond the 20x20 box. This will clip the icon or render incorrectly.

**Viewport:** All -- affects icon rail sidebar.

**Fix:** Re-draw the paths to fit within the 0-20 coordinate space, or expand the viewBox to match the actual path bounds.

### 5. Chip row wrapping on narrow viewports

**Problem:** The `flex-wrap gap-2` chip row in ArtifactChipSelector works well, but with several custom types added, the "+ Custom" button plus built-in chips could push below the fold on mobile (360px). This is a minor density concern, not a layout break.

**Viewport:** 360px mobile.

**Fix:** No immediate fix needed. If custom type counts grow large, consider a horizontal scroll or collapse pattern. Low priority.

## Viewport Verification Checklist

- [x] 360px mobile -- Chip row wraps correctly; modals are full-width with mx-4 gutters; minor density concern with many custom chips (item 5)
- [ ] 1366x768 laptop -- CustomTypeDesigner review step will push action buttons below fold (item 1); ArtifactTypeModal header may scroll away with many custom types (item 2)
- [x] 1920x1080 desktop -- No issues expected; modal max-w-2xl / max-w-lg are well-sized
