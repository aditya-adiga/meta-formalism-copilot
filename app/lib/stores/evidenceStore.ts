/**
 * Zustand store for evidence search results.
 *
 * Separate from the main workspaceStore because evidence is metadata *about*
 * artifacts, not an artifact itself — it doesn't participate in artifact
 * versioning, undo/redo, or generation provenance.
 *
 * Persists to localStorage with the same debounced write pattern as
 * workspaceStore to avoid excessive serialization.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { EvidenceSlot, PaperScore, OverlapAnalysis } from "@/app/lib/types/evidence";

// ---------------------------------------------------------------------------
// Debounced localStorage adapter (same pattern as workspaceStore)
// ---------------------------------------------------------------------------

function createDebouncedStorage() {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        try {
          localStorage.setItem(name, value);
        } catch (e) {
          console.warn("Failed to persist evidence store:", e);
        }
        pending = null;
      }, 300);
    },
    removeItem: (name: string) => {
      if (pending) clearTimeout(pending);
      pending = null;
      localStorage.removeItem(name);
    },
  };
}

// Hoist so the persist middleware always uses the same adapter instance.
// Safe at module scope because the adapter's methods are only invoked via the
// persist middleware's `storage` config, which is guarded by
// `typeof window !== "undefined"` in the persist config below. During SSR,
// `storage` is `undefined` so the adapter is never called.
const debouncedStorage = createDebouncedStorage();

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface EvidenceState {
  /** Evidence slots keyed by "artifactType::elementId" */
  slots: Record<string, EvidenceSlot>;
  /** Per-element overlap analysis results */
  overlap: Record<string, OverlapAnalysis>;
  /** Per-element loading state (search or scoring) */
  loading: Record<string, boolean>;
  /** Per-element scoring loading state */
  scoring: Record<string, boolean>;
  /** Per-element overlap analysis loading state */
  analyzing: Record<string, boolean>;
  /** Per-element error messages */
  errors: Record<string, string>;
}

interface EvidenceActions {
  setEvidence: (key: string, slot: EvidenceSlot) => void;
  setLoading: (key: string, loading: boolean) => void;
  setScoring: (key: string, scoring: boolean) => void;
  setAnalyzing: (key: string, analyzing: boolean) => void;
  setError: (key: string, error: string | null) => void;
  /** Apply LLM scores to papers in a slot */
  applyScores: (key: string, scores: PaperScore[]) => void;
  /** Apply overlap analysis results */
  applyOverlap: (key: string, analysis: OverlapAnalysis) => void;
  clearEvidence: (key: string) => void;
  clearAll: () => void;
}

const DEFAULT_STATE: EvidenceState = {
  slots: {},
  overlap: {},
  loading: {},
  scoring: {},
  analyzing: {},
  errors: {},
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEvidenceStore = create<EvidenceState & EvidenceActions>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setEvidence: (key, slot) =>
        set((state) => ({
          slots: { ...state.slots, [key]: slot },
        })),

      setLoading: (key, loading) =>
        set((state) => ({
          loading: { ...state.loading, [key]: loading },
        })),

      setScoring: (key: string, scoring: boolean) =>
        set((state: EvidenceState) => ({
          scoring: { ...state.scoring, [key]: scoring },
        })),

      setAnalyzing: (key: string, analyzing: boolean) =>
        set((state: EvidenceState) => ({
          analyzing: { ...state.analyzing, [key]: analyzing },
        })),

      setError: (key: string, error: string | null) =>
        set((state: EvidenceState) => {
          if (error === null) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [key]: _removed, ...rest } = state.errors;
            return { errors: rest };
          }
          return { errors: { ...state.errors, [key]: error } };
        }),

      applyScores: (key: string, scores: PaperScore[]) =>
        set((state: EvidenceState) => {
          const slot = state.slots[key];
          if (!slot) return {};
          const scoreMap = new Map(scores.map((s) => [s.openAlexId, s]));
          const updatedPapers = slot.papers.map((paper) => {
            const score = scoreMap.get(paper.openAlexId);
            if (!score) return paper;
            return {
              ...paper,
              reliability: score.reliability,
              relatedness: score.relatedness,
            };
          });
          // Only mark as fully scored if every paper received a score
          const allScored = updatedPapers.every((p) => p.reliability !== null);
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: updatedPapers,
                scored: allScored,
                scoredAt: new Date().toISOString(),
              },
            },
          };
        }),

      applyOverlap: (key: string, analysis: OverlapAnalysis) =>
        set((state: EvidenceState) => ({
          overlap: { ...state.overlap, [key]: analysis },
        })),

      clearEvidence: (key: string) =>
        set((state: EvidenceState) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _s, ...restSlots } = state.slots;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _o, ...restOverlap } = state.overlap;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _l, ...restLoading } = state.loading;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _sc, ...restScoring } = state.scoring;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _a, ...restAnalyzing } = state.analyzing;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _e, ...restErrors } = state.errors;
          return {
            slots: restSlots,
            overlap: restOverlap,
            loading: restLoading,
            scoring: restScoring,
            analyzing: restAnalyzing,
            errors: restErrors,
          };
        }),

      clearAll: () => set({ slots: {}, overlap: {}, loading: {}, scoring: {}, analyzing: {}, errors: {} }),
    }),
    {
      name: "evidence-store-v1",
      storage: typeof window !== "undefined"
        ? createJSONStorage(() => debouncedStorage)
        : undefined,
      // Only persist slots and overlap, not transient loading state
      partialize: (state: EvidenceState & EvidenceActions) => ({ slots: state.slots, overlap: state.overlap }),
      skipHydration: true,
    },
  ),
);
