# Multi-Artifact Implementation Plan

Implements decisions [002](../decisions/002-multi-artifact-ui-layout.md) (UI layout) and [003](../decisions/003-artifact-generation-api.md) (API contracts).

## Current State

The type infrastructure is already in place:
- `ArtifactType` includes all six types (`session.ts`)
- `ArtifactData`, `NodeArtifact`, `ArtifactGenerationRequest`, `ArtifactVerificationResponse` defined (`session.ts`, `decomposition.ts`, `artifacts.ts`)
- `PanelId` includes `statistical-model`, `property-tests`, `dialectical-map` (`panels.ts`)
- `PropositionNode` has `context`, `selectedArtifactTypes`, `artifacts` fields (declared, unused)
- `FormalizationSession` has `artifacts: ArtifactData[]` (declared, always `[]`)
- Causal graph: route + panel + panel definition all working
- `ARTIFACT_ROUTE` map exists with only `causal-graph` entry
- `page.tsx` is 435 lines after the refactor (hooks extracted: `useFormalizationPipeline`, `useActiveArtifactState`, `usePanelDefinitions`)

The gap: types exist but nothing uses the multi-artifact fields. Panels, hooks, and routes for 3 of 4 new artifact types don't exist.

## Simplifying Assumptions

- **No backward-compatible session migration.** Only one user currently. Old localStorage data can be overwritten.
- **Migrate semiformal route early.** Adopt the uniform `ArtifactGenerationRequest` shape on the existing `/api/formalization/semiformal` route in Phase 1 rather than building an adapter in Phase 5.
- **No Phase 9 cleanup.** The `useArtifactGeneration` hook (Phase 5) absorbs the per-type fetch logic from `page.tsx`, preventing growth rather than cleaning up after the fact.

---

## Phase 1: Backend Routes

**No dependencies. Branch: `feat/artifact-routes`**

Three new routes + one migration + shared helper extraction.

### 1a. Shared route helper

**New file:** `app/lib/formalization/artifactRoute.ts`

Extract from `causal-graph/route.ts`:
- `buildUserMessage(req: ArtifactGenerationRequest): string` (lines 49-71)
- `extractJson(raw: string): string` (lines 89-93)
- `handleArtifactRoute(request, config)` — generic POST handler that calls `callLlm()`, parses JSON, handles errors, returns response. Config provides: system prompt, endpoint name, mock response factory, response wrapper key.

This avoids duplicating ~60 lines of error handling and message building across 4 routes.

### 1b. Response types

**Edit:** `app/lib/types/artifacts.ts`

Add `StatisticalModelResponse`, `PropertyTestsResponse`, `DialecticalMapResponse` (shapes from 003 §3). Add entries to `ARTIFACT_ROUTE` map.

### 1c. `app/api/formalization/statistical-model/route.ts`

- System prompt: statistical reasoning analyst
- Response key: `statisticalModel`
- Mock: 2 variables, 1 hypothesis, 1 assumption, summary

### 1d. `app/api/formalization/property-tests/route.ts`

- System prompt: property-based testing specification analyst
- Response key: `propertyTests`
- Mock: 1 property with pseudocode, 1 data generator, summary

### 1e. `app/api/formalization/dialectical-map/route.ts`

- System prompt: dialectical analyst
- Response key: `dialecticalMap`
- Mock: 2 perspectives, 1 tension, synthesis, summary

### 1f. Migrate semiformal route to uniform request shape

**Edit:** `app/api/formalization/semiformal/route.ts`

Change accepted body from `{ text: string }` to `ArtifactGenerationRequest` (`{ sourceText, context, ... }`). Context becomes a separate field used distinctly in the system prompt rather than being embedded in the text by the frontend.

**Edit:** `app/lib/formalization/api.ts` — update `generateSemiformal()` to send `{ sourceText, context }` instead of `{ text }`.

### 1g. Refactor causal-graph route to use shared helper

**Edit:** `app/api/formalization/causal-graph/route.ts` — replace inline `buildUserMessage`, `extractJson`, error handling with call to shared `handleArtifactRoute`.

### Verification

- `npm run build` passes
- `npm run lint` passes
- Manual test: each route returns mock data when no API key configured
- Manual test: causal graph still works end-to-end

---

## Phase 2: Artifact Chip Selector Component

**No dependencies. Branch: `feat/artifact-chip-selector`**

### 2a. Artifact metadata

**Edit:** `app/lib/types/artifacts.ts`

```typescript
export const ARTIFACT_META: Record<ArtifactType, { label: string; chipLabel: string }> = {
  "semiformal": { label: "Semiformal Proof", chipLabel: "Deductive (Lean)" },
  "lean": { label: "Lean4 Code", chipLabel: "Lean4 Code" },
  "causal-graph": { label: "Causal Graph", chipLabel: "Causal Graph" },
  "statistical-model": { label: "Statistical Model", chipLabel: "Statistical Model" },
  "property-tests": { label: "Property Tests", chipLabel: "Property Tests" },
  "dialectical-map": { label: "Dialectical Map", chipLabel: "Dialectical Map" },
};

// Selectable as chips (lean excluded — it's step 2 of the deductive pipeline)
export const SELECTABLE_ARTIFACT_TYPES: ArtifactType[] = [
  "semiformal", "causal-graph", "statistical-model", "property-tests", "dialectical-map",
];
```

### 2b. `ArtifactChipSelector` component

**New file:** `app/components/features/artifact-selector/ArtifactChipSelector.tsx`

Props:
```typescript
{
  selected: ArtifactType[];
  onChange: (types: ArtifactType[]) => void;
  loading?: Partial<Record<ArtifactType, boolean>>;
  disabled?: boolean;
}
```

- Renders a row of toggleable pill/chip buttons from `SELECTABLE_ARTIFACT_TYPES`
- Labels from `ARTIFACT_META[type].chipLabel`
- Multiple chips can be active simultaneously
- Active state: filled background; inactive: outlined
- Per-chip spinner overlay when `loading[type]` is true
- Follows design system: CSS variables, Tailwind, EB Garamond

### Verification

- `npm run build` passes
- Component renders correctly in isolation (import into any panel temporarily to check)

---

## Phase 3: Panel Stubs for New Artifact Types

**Depends on:** Phase 1b (response types in `artifacts.ts`).

**Branch: `feat/artifact-panel-stubs`**

### 3a. Panel icons

**Edit:** `app/components/ui/icons/PanelIcons.tsx`

Add `StatisticalModelIcon`, `PropertyTestsIcon`, `DialecticalMapIcon`. Simple SVG icons following the existing icon pattern (16x16 or 20x20, stroke-based).

### 3b. `StatisticalModelPanel`

**New file:** `app/components/panels/StatisticalModelPanel.tsx`

Props: `{ statisticalModel: StatisticalModelResponse["statisticalModel"] | null; loading: boolean }`

Renders: summary, variables table (with role badges: independent/dependent/confounding/control), hypotheses list (statement + null hypothesis + test suggestion), assumptions list, sample requirements.

Read-only display. Same structural pattern as `CausalGraphPanel`.

### 3c. `PropertyTestsPanel`

**New file:** `app/components/panels/PropertyTestsPanel.tsx`

Props: `{ propertyTests: PropertyTestsResponse["propertyTests"] | null; loading: boolean }`

Renders: summary, properties list (name, description, preconditions, postcondition, pseudocode in monospace block), data generators list.

### 3d. `DialecticalMapPanel`

**New file:** `app/components/panels/DialecticalMapPanel.tsx`

Props: `{ dialecticalMap: DialecticalMapResponse["dialecticalMap"] | null; loading: boolean }`

Renders: topic heading, perspectives (label, core claim, supporting arguments, vulnerabilities), tensions between perspectives, synthesis (equilibrium + how each perspective is addressed).

### Verification

- `npm run build` passes
- Each panel renders sensibly with mock data

---

## Phase 4: Wire Panels into Layout

**Depends on:** Phase 2, Phase 3. **Branch: `feat/wire-artifact-panels`**

### 4a. Panel definitions

**Edit:** `app/hooks/usePanelDefinitions.tsx`

Add three new `PanelDef` entries for `statistical-model`, `property-tests`, `dialectical-map` — each with `hidden: true` until data exists. Add input props: `hasStatisticalModel`, `hasPropertyTests`, `hasDialecticalMap`, plus loading booleans.

### 4b. IconRail section separator

**Edit:** `app/components/layout/IconRail.tsx`

Add a visual separator between input/navigation panels (source, decomposition, node-detail) and artifact output panels (semiformal, lean, causal-graph, ...). Per 002 §5. Rendered as a thin horizontal line or "Artifacts" label between panel groups.

Implementation: the `PanelDef` type or `usePanelDefinitions` output can include a `group` field, and `IconRail` renders separators between groups.

### 4c. State and panel content in `page.tsx`

**Edit:** `app/page.tsx`

Add state:
```typescript
const [statisticalModel, setStatisticalModel] = useState(null);
const [propertyTests, setPropertyTests] = useState(null);
const [dialecticalMap, setDialecticalMap] = useState(null);
const [statisticalModelLoading, setStatisticalModelLoading] = useState(false);
const [propertyTestsLoading, setPropertyTestsLoading] = useState(false);
const [dialecticalMapLoading, setDialecticalMapLoading] = useState(false);
```

Add panel content entries:
```typescript
"statistical-model": <StatisticalModelPanel statisticalModel={statisticalModel} loading={statisticalModelLoading} />,
"property-tests": <PropertyTestsPanel propertyTests={propertyTests} loading={propertyTestsLoading} />,
"dialectical-map": <DialecticalMapPanel dialecticalMap={dialecticalMap} loading={dialecticalMapLoading} />,
```

Wire panel definitions with new `has*` / `*Loading` props.

### 4d. Fix panel content key for decomposition

**Edit:** `app/page.tsx`

The `panelContent` map currently uses `graph` as the key for `GraphPanel` (line 372) but `PanelId` was renamed to `"decomposition"`. Change the key to `"decomposition"`.

### Verification

- `npm run build` passes
- New panels appear in the rail when data exists (test by temporarily setting mock data in state)
- Section separator renders between navigation and artifact groups
- Existing panels still work

---

## Phase 5: Parallel Artifact Generation

**Depends on:** Phase 4. **Branch: `feat/parallel-artifact-generation`**

### 5a. `useArtifactGeneration` hook

**New file:** `app/hooks/useArtifactGeneration.ts`

```typescript
type ArtifactLoadingState = Partial<Record<ArtifactType, "idle" | "generating" | "done" | "error">>;

function useArtifactGeneration() {
  const [loadingState, setLoadingState] = useState<ArtifactLoadingState>({});

  async function generateArtifacts(
    selectedTypes: ArtifactType[],
    request: ArtifactGenerationRequest,
  ): Promise<Partial<Record<ArtifactType, unknown>>> { ... }

  const isAnyGenerating: boolean = ...;

  return { loadingState, generateArtifacts, isAnyGenerating };
}
```

Logic:
- For each selected type, looks up route in `ARTIFACT_ROUTE`
- Fires all POSTs in parallel via `Promise.allSettled`
- Special case: `"semiformal"` calls the existing semiformal route (now with uniform request shape from Phase 1f)
- Updates per-type loading state independently
- Returns results keyed by artifact type; caller stores them

### 5b. Integrate into `page.tsx`

Replace `handleGenerateCausalGraph` (lines 270-299) and `handleGenerateSemiformal` (lines 213-218) with a unified `handleGenerate`:

```typescript
const handleGenerate = useCallback(async () => {
  const request = {
    sourceText: isDecompMode && selectedNode
      ? `${selectedNode.statement}\n\n${selectedNode.proofText}`
      : combinedPaperText,
    context: contextText,
    nodeId: selectedNode?.id,
    nodeLabel: selectedNode?.label,
  };

  if (!isDecompMode) {
    selectNode(null);
    createSession({ type: "global" });
  } else if (selectedNode) {
    createSession({ type: "node", nodeId: selectedNode.id, nodeLabel: selectedNode.label });
  }

  const results = await generateArtifacts(selectedArtifactTypes, request);

  // Store results in appropriate state
  if (results.semiformal) { /* set semiformal, navigate to panel */ }
  if (results["causal-graph"]) { setCausalGraph(results["causal-graph"]); }
  if (results["statistical-model"]) { setStatisticalModel(results["statistical-model"]); }
  // ... etc
}, [...]);
```

The deductive pipeline special case: when `"semiformal"` is selected, the hook calls the semiformal route. Lean generation remains a separate explicit action from the Semiformal panel (002 §9 / 003 §9).

### 5c. Global artifact type selection state

**Edit:** `app/page.tsx`

```typescript
const [selectedArtifactTypes, setSelectedArtifactTypes] = useState<ArtifactType[]>(["semiformal"]);
```

This is the global chip selection state, passed to the `ArtifactChipSelector` in `InputPanel`.

### Verification

- `npm run build` passes
- Selecting multiple chips and clicking "Formalise" fires parallel requests
- Each artifact panel shows results independently
- Partial failure: if one route fails, others still complete and display
- Deductive pipeline: selecting "Deductive (Lean)" generates semiformal only; Lean still triggered from Semiformal panel

---

## Phase 6: InputPanel Decomposition Fork + Chip Selector

**Depends on:** Phase 2 (chip selector), Phase 5 (generation hook). **Branch: `feat/input-panel-fork`**

### 6a. Extract `FormalizationControls` component

**New file:** `app/components/features/formalization-controls/FormalizationControls.tsx`

Extracts from InputPanel: context textarea + refinement buttons + artifact chip selector + "Formalise" button. Reused in both InputPanel and NodeDetailPanel.

Props:
```typescript
{
  contextText: string;
  onContextChange: (text: string) => void;
  selectedArtifactTypes: ArtifactType[];
  onArtifactTypesChange: (types: ArtifactType[]) => void;
  onGenerate: () => void;
  loading: boolean;
  loadingState?: ArtifactLoadingState;
  refinementSource?: string;          // text to refine context against
  onRefinedContext?: (text: string) => void;
}
```

### 6b. Update InputPanel layout

**Edit:** `app/components/panels/InputPanel.tsx`

Three sections per 002 §2:
1. **Source Inputs** — TextInput + FileUpload (unchanged)
2. **Action Choice** — "Decompose into nodes" button, visual separator, then `FormalizationControls` for direct formalization
3. Button label: "Formalise" when 1 type selected, "Formalise -> N artifacts" when multiple

The "Decompose into nodes" button calls the existing `onDecompose` prop (already wired through `page.tsx`). Add this prop to InputPanel if not already present.

### 6c. Wire in `page.tsx`

Pass `selectedArtifactTypes`, `onArtifactTypesChange`, and `onGenerate` (the unified handler from Phase 5) to InputPanel.

### Verification

- InputPanel shows both paths: decompose and direct formalize
- Chip selector toggles work
- "Formalise" triggers parallel generation for selected types
- Decompose button still works

---

## Phase 7: NodeDetailPanel Per-Node Context + Chips

**Depends on:** Phase 6a (`FormalizationControls`). **Branch: `feat/node-detail-artifacts`**

### 7a. Update NodeDetailPanel

**Edit:** `app/components/panels/NodeDetailPanel.tsx`

Add `FormalizationControls` below the node statement/dependencies section:
- Per-node context textarea — placeholder shows global context text, user can override
- Artifact chip selector — state stored in `node.selectedArtifactTypes`
- "Formalise" button triggers per-node generation

Props additions:
```typescript
{
  globalContextText: string;           // shown as placeholder
  onNodeContextChange: (text: string) => void;
  onNodeArtifactTypesChange: (types: ArtifactType[]) => void;
  onGenerate: () => void;             // replaces current onFormalise
  loadingState?: ArtifactLoadingState;
}
```

### 7b. Wire per-node generation in `page.tsx`

The unified `handleGenerate` from Phase 5 already handles the `isDecompMode` case. Update the NodeDetailPanel content entry to pass the right props:
- `node.context` for context text
- `node.selectedArtifactTypes` for chip state
- `updateNode(id, { context })` for context changes
- `updateNode(id, { selectedArtifactTypes })` for chip changes

### Verification

- Per-node context override works (shows global as placeholder, saves override to node)
- Per-node artifact type selection persists across node switches
- "Formalise" on a node generates only the selected artifact types for that node

---

## Phase 8: Session Artifact Storage

**Depends on:** Phase 5 (generation stores results). **Branch: `feat/session-artifacts`**

### 8a. Switch sessions to use `artifacts[]`

**Edit:** `app/hooks/useFormalizationSessions.ts`

- `createSession()`: initialize with `artifacts: []`, still populate legacy fields for now
- `updateSession()`: accept artifact data, push/update entries in `artifacts[]`
- New helper: `updateSessionArtifact(type: ArtifactType, content: string)` — upserts an artifact entry

No migration of old data — old sessions in localStorage are discarded on shape mismatch.

### 8b. Switch `PropositionNode` to use `artifacts[]`

**Edit:** `app/hooks/useDecomposition.ts`

When `updateNode` is called with artifact results from `useArtifactGeneration`, store in `node.artifacts[]`. Keep legacy fields (`semiformalProof`, `leanCode`, etc.) populated for now since existing panels read them.

### 8c. Store generated artifacts

**Edit:** `app/page.tsx` (or the `handleGenerate` callback)

After `generateArtifacts()` returns results, create `ArtifactData` entries and call `updateSessionArtifact()` for each. For per-node generation, also push to `node.artifacts[]` via `updateNode`.

### 8d. Persistence

**Edit:** `app/hooks/useWorkspacePersistence.ts`

The persisted workspace shape already includes decomposition state (which includes nodes with artifacts). Ensure the new artifact state variables (statisticalModel, propertyTests, dialecticalMap) are also persisted, or alternatively, derive them from session artifacts on load.

### Verification

- Generated artifacts appear in session data
- Switching between sessions restores the correct artifacts
- Per-node artifacts persist across page refresh

---

## Dependency Graph

```
Phase 1 (routes) ──────────────┐
                                ├── Phase 4 (wire panels) ── Phase 5 (parallel gen) ── Phase 8 (storage)
Phase 2 (chip selector) ───────┤                                    │
                                │                              Phase 6 (InputPanel fork)
Phase 3 (panel stubs) ─────────┘                                    │
                                                               Phase 7 (NodeDetail per-node)
```

Phases 1, 2, 3 are fully independent — three parallel workstreams.
Phase 4 merges them. Phases 5-8 are sequential.

## Scope Summary

| Phase | New files | Edited files | Complexity |
|-------|-----------|--------------|------------|
| 1 | 3 routes + 1 helper | `artifacts.ts`, `causal-graph/route.ts`, `semiformal/route.ts`, `api.ts` | Low |
| 2 | 1 component | `artifacts.ts` | Low |
| 3 | 3 panels | `PanelIcons.tsx` | Low |
| 4 | 0 | `usePanelDefinitions`, `IconRail`, `page.tsx` | Medium |
| 5 | 1 hook | `page.tsx` | Medium |
| 6 | 1 component | `InputPanel`, `page.tsx` | Medium |
| 7 | 0 | `NodeDetailPanel`, `page.tsx` | Medium |
| 8 | 0 | `useFormalizationSessions`, `useDecomposition`, `useWorkspacePersistence`, `page.tsx` | Medium |

## Risk Areas

1. **Phase 5 — Deductive pipeline dual identity.** "Deductive (Lean)" as a chip generates semiformal, but Lean is a separate step. The `useArtifactGeneration` hook must not treat `"lean"` as a selectable type — only `"semiformal"`. The Lean step remains on the Semiformal panel's "Generate Lean4 Code" button, using the existing `useFormalizationPipeline`.

2. **Phase 4d — `graph` vs `decomposition` panel key.** The `panelContent` map uses `"graph"` but `PanelId` says `"decomposition"`. This is likely a latent bug. Fixing it may require checking whether `activePanelId` is ever set to `"graph"` elsewhere.

3. **Phase 5 — `page.tsx` unified handler complexity.** The `handleGenerate` callback must handle both global and per-node modes, store results in different places, create sessions with different scopes, and navigate to the "first" generated panel. Keep this handler thin by delegating storage to helpers.

4. **Phase 6 — InputPanel prop growth.** InputPanel gains several new props (artifact types, decompose handler, loading state). If it becomes unwieldy, the `FormalizationControls` extraction absorbs most of the complexity.
