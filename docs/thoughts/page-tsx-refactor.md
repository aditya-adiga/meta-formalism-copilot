# page.tsx Refactor Design

Preparatory refactor for [002-multi-artifact-ui-layout](../decisions/002-multi-artifact-ui-layout.md). Goal: reduce page.tsx from a 709-line monolith to a thin composition shell so adding 4 new artifact types doesn't make it unmaintainable.

## Problem Analysis

page.tsx currently mixes five concerns:

1. **Formalization orchestration** (~150 lines) — `handleGenerateSemiformal`, `handleGenerateLean`, `handleReVerify`, `handleLeanIterate`, `handleRegenerateLean` plus the retry loop logic, `verifyLean`, `fetchApi`, `generateLean` helpers
2. **Decomposition ↔ formalization bridge** (~80 lines) — `handleNodeGenerateSemiformal`, `handleNodeGenerateLean`, all the `isDecompMode` branching for active state resolution (`activeSemiformal`, `activeLeanCode`, `activeVerificationStatus`, etc.)
3. **Session wiring** (~40 lines) — `handleSelectSession`, session creation/update calls scattered through every handler
4. **Panel definitions** (~60 lines) — the `panels` array with icons, labels, status summaries
5. **Panel content map** (~80 lines) — the `panelContent` record wiring props to each panel component

The `isDecompMode` branching is the worst smell — nearly every handler has an `if (isDecompMode && selectedNode)` / `else` fork. This will multiply when each fork also needs to handle 5 artifact types instead of 1.

## Proposed Structure

### New Hook: `useFormalizationPipeline`

**File:** `app/hooks/useFormalizationPipeline.ts`

Extracts all formalization orchestration — the generate/verify/retry/iterate loop — into a single hook that works for both global and per-node contexts. This is the highest-value extraction because:
- It's the largest block of logic (~230 lines including both global and node variants)
- The global and per-node variants are near-duplicates with minor differences (where state is read/written, whether dependency context is gathered)
- When new artifact types arrive, each will have its own pipeline; having the deductive pipeline in a hook establishes the pattern

```typescript
// Inputs: where to read/write state, optional dependency context
type PipelineConfig = {
  getSemiformal: () => string;
  setSemiformal: (text: string) => void;
  getLeanCode: () => string;
  setLeanCode: (code: string) => void;
  setVerificationStatus: (status: VerificationStatus) => void;
  setVerificationErrors: (errors: string) => void;
  getDependencyContext?: () => string | undefined;
  onSessionUpdate?: (updates: Partial<SessionUpdates>) => void;
};

// Returns: handler functions + loading state
type PipelineReturn = {
  loadingPhase: LoadingPhase;
  generateSemiformal: (inputText: string) => Promise<void>;
  generateLean: () => Promise<void>;
  reVerify: () => Promise<void>;
  leanIterate: (instruction: string) => Promise<void>;
  regenerateLean: () => Promise<void>;
};
```

The key insight: instead of `isDecompMode` branching inside every handler, the *caller* provides the right read/write accessors. page.tsx creates two pipeline instances — one for global, one that targets the selected node — and passes the appropriate one to panels.

### New Hook: `useActiveArtifactState`

**File:** `app/hooks/useActiveArtifactState.ts`

Extracts the `isDecompMode` resolution logic — the ~20 lines that compute `activeSemiformal`, `activeLeanCode`, `activeVerificationStatus`, `activeVerificationErrors`, `semiformalReadyForLean` from either the selected node or global state.

```typescript
function useActiveArtifactState(
  globalState: { semiformalText: string; leanCode: string; verificationStatus: VerificationStatus; verificationErrors: string },
  selectedNode: PropositionNode | null,
  loadingPhase: LoadingPhase,
): {
  isDecompMode: boolean;
  activeSemiformal: string;
  activeLeanCode: string;
  activeVerificationStatus: VerificationStatus;
  activeVerificationErrors: string;
  semiformalReadyForLean: boolean;
}
```

Small but eliminates the scattered derivation logic from page.tsx and gives a single place to extend when new artifact types need their own active-state resolution.

### Extract: `usePanelDefinitions`

**File:** `app/hooks/usePanelDefinitions.ts`

The `panels` array definition (lines 525-582) is pure derived state from a handful of inputs. Extract it to declutter page.tsx and make it easy to add new panel entries for the 4 new artifact types.

```typescript
function usePanelDefinitions(opts: {
  sourceText: string;
  extractedFiles: { name: string }[];
  contextText: string;
  activeSemiformal: string;
  activeLeanCode: string;
  loadingPhase: LoadingPhase;
  activeVerificationStatus: VerificationStatus;
  semiformalReadyForLean: boolean;
  decomp: { nodes: PropositionNode[] };
  selectedNode: PropositionNode | null;
}): PanelDef[]
```

### Do NOT Extract: Panel Content Map

The `panelContent` record (lines 607-695) wires specific props to specific panel components. This is inherently a composition concern — it's the thing page.tsx *should* be doing. Extracting it would just move the prop-threading somewhere else without reducing complexity. Keep it in page.tsx but benefit from the smaller handler functions (pipeline hooks replace the inline callbacks).

### Do NOT Extract: `fetchApi` / `verifyLean`

These are thin HTTP helpers used only by the pipeline. Move them into `useFormalizationPipeline` or into a small `app/lib/formalization/api.ts` utility. They don't need their own hook.

## Migration Plan

Three PRs, each independently mergeable and testable:

### PR 1: Extract `useFormalizationPipeline`

1. Create `app/lib/formalization/api.ts` — move `fetchApi`, `verifyLean`, `generateLean` (the fetch wrappers from page.tsx lines 34-167)
2. Create `app/hooks/useFormalizationPipeline.ts` — the hook with the config-based approach above
3. In page.tsx: create two pipeline instances (global + node), replace all 6 handler functions with pipeline methods
4. Verify: `npm run build` + manual test of generate semiformal → generate lean → verify → iterate flow in both global and decomposition modes

Expected page.tsx reduction: ~200 lines removed, ~20 lines added for pipeline instantiation.

### PR 2: Extract `useActiveArtifactState` + `usePanelDefinitions`

1. Create `app/hooks/useActiveArtifactState.ts`
2. Create `app/hooks/usePanelDefinitions.ts`
3. Update page.tsx to use both
4. Verify: build + lint

Expected page.tsx reduction: ~80 lines removed, ~10 lines added for hook calls.

### PR 3: Simplify session wiring

1. Move `handleSelectSession` logic into `useFormalizationSessions` (it's session-management logic that currently lives in page.tsx because it needs to update decomposition/global state — solve by passing update callbacks to the hook or by having the hook return a richer `selectSession` that accepts a state-update callback)
2. Reduce the scattered `if (activeSession) updateSession(...)` calls by integrating session tracking into the pipeline hook's `onSessionUpdate` callback

Expected page.tsx reduction: ~40 lines of scattered session update calls consolidated.

## Post-Refactor page.tsx Shape

```typescript
export default function Home() {
  const [activePanelId, setActivePanelId] = useState<PanelId>("source");

  // Persisted state
  const { sourceText, setSourceText, ... } = useWorkspacePersistence();

  // Decomposition
  const { state: decomp, selectedNode, ... } = useDecomposition();

  // Active artifact resolution
  const { isDecompMode, activeSemiformal, ... } = useActiveArtifactState(globalState, selectedNode, loadingPhase);

  // Formalization pipelines (global + per-node)
  const globalPipeline = useFormalizationPipeline({ /* global accessors */ });
  const nodePipeline = useFormalizationPipeline({ /* node accessors */ });
  const activePipeline = isDecompMode ? nodePipeline : globalPipeline;

  // Sessions
  const { activeSession, ... } = useFormalizationSessions();

  // Auto-formalize queue
  const { progress: queueProgress, ... } = useAutoFormalizeQueue(decomp.nodes, updateNode);

  // Panel definitions
  const panels = usePanelDefinitions({ ... });

  // Panel content (the composition glue — this IS what page.tsx is for)
  const panelContent = useMemo(() => ({ ... }), [...]);

  return <PanelShell ... />;
}
```

Target: ~250 lines, down from 709. The remaining lines are panel content wiring (which will grow as new artifact panels are added, but each new panel is ~15 lines of JSX, not ~80 lines of handler logic).

## Risks

- **Two pipeline instances sharing `loadingPhase`**: Both pipelines write to a single loading indicator. Options: (a) each pipeline owns its own phase and page.tsx derives a combined phase, or (b) pass a shared setter. Option (a) is cleaner — the UI can show per-pipeline loading independently, which matters when 002 enables parallel generation of multiple artifact types.

- **Stale closures in pipeline config**: The config callbacks (`getSemiformal`, etc.) capture state at hook creation time. Use refs or pass current values through function parameters rather than closing over state values.

- **Session update integration**: The pipeline's `onSessionUpdate` callback needs the active session ID, which changes when `createSession` is called at the start of a pipeline run. The pipeline hook should accept a session ID ref or a `getSessionId` callback rather than a static ID.
