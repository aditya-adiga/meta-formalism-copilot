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
import type { EvidencePaper, EvidenceSlot, PaperScore, OverlapAnalysis, IntegrationProposal } from "@/app/lib/types/evidence";

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
  /** Per-element integration proposals */
  proposals: Record<string, IntegrationProposal[]>;
  /** Per-element loading state (search or scoring) */
  loading: Record<string, boolean>;
  /** Per-element scoring loading state */
  scoring: Record<string, boolean>;
  /** Per-element overlap analysis loading state */
  analyzing: Record<string, boolean>;
  /** Per-element integration loading state */
  integrating: Record<string, boolean>;
  /** Per-element search error messages */
  errors: Record<string, string>;
  /** Per-element scoring error messages (separate channel from search so the
   *  two operations don't clear or mask each other's errors) */
  scoringErrors: Record<string, string>;
}

interface EvidenceActions {
  setEvidence: (key: string, slot: EvidenceSlot) => void;
  setLoading: (key: string, loading: boolean) => void;
  setScoring: (key: string, scoring: boolean) => void;
  setAnalyzing: (key: string, analyzing: boolean) => void;
  setIntegrating: (key: string, integrating: boolean) => void;
  setError: (key: string, error: string | null) => void;
  setScoringError: (key: string, error: string | null) => void;
  /** Apply LLM scores to papers in a slot */
  applyScores: (key: string, scores: PaperScore[]) => void;
  /** Apply overlap analysis results */
  applyOverlap: (key: string, analysis: OverlapAnalysis) => void;
  /** Store integration proposals */
  setProposals: (key: string, proposals: IntegrationProposal[]) => void;
  /** Update decision on a single proposal */
  setProposalDecision: (key: string, proposalId: string, decision: boolean) => void;
  /** Clear all proposals for a slot */
  clearProposals: (key: string) => void;
  /** Merge freshly-searched papers into an existing slot (dedup by id,
   *  existing papers win) and replace the slot's query list. */
  mergeEvidence: (key: string, queries: string[], newPapers: EvidencePaper[]) => void;
  /** Soft-prune a paper (status -> pruned). */
  prunePaper: (key: string, openAlexId: string) => void;
  /** Restore a pruned paper (status -> evaluated if scored, else retrieved). */
  restorePaper: (key: string, openAlexId: string) => void;
  clearEvidence: (key: string) => void;
  clearAll: () => void;
}

const DEFAULT_STATE: EvidenceState = {
  slots: {},
  overlap: {},
  proposals: {},
  loading: {},
  scoring: {},
  analyzing: {},
  integrating: {},
  errors: {},
  scoringErrors: {},
};

/** Migrate persisted evidence state across store versions.
 *  v0 -> v1: backfill `status` on papers (evaluated if already scored, else
 *  retrieved). Exported for direct unit testing. */
export function migrateEvidenceState(persistedState: unknown, version: number): unknown {
  const state = persistedState as { slots?: Record<string, EvidenceSlot> } | null;
  if (!state || typeof state !== "object" || !state.slots) return persistedState;
  if (version >= 1) return persistedState;

  const slots: Record<string, EvidenceSlot> = {};
  for (const [key, slot] of Object.entries(state.slots)) {
    slots[key] = {
      ...slot,
      papers: (Array.isArray(slot.papers) ? slot.papers : []).map((p) => {
        const existing = (p as Partial<EvidencePaper>).status;
        return {
          ...p,
          status: existing ?? (p.reliability ? "evaluated" : "retrieved"),
        } as EvidencePaper;
      }),
    };
  }
  return { ...state, slots };
}

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

      setIntegrating: (key: string, integrating: boolean) =>
        set((state: EvidenceState) => ({
          integrating: { ...state.integrating, [key]: integrating },
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

      setScoringError: (key: string, error: string | null) =>
        set((state: EvidenceState) => {
          if (error === null) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [key]: _removed, ...rest } = state.scoringErrors;
            return { scoringErrors: rest };
          }
          return { scoringErrors: { ...state.scoringErrors, [key]: error } };
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
              // Status reflects the scoring step having completed. Only an
              // active 'retrieved' paper advances; pruned/integrated are left
              // as-is even if a stray score arrives.
              status: paper.status === "retrieved" ? ("evaluated" as const) : paper.status,
            };
          });
          // "Scored" is derived from the papers (see isSlotScored), so there is
          // no separate flag to keep in sync here — just record when scoring ran.
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: updatedPapers,
                scoredAt: new Date().toISOString(),
              },
            },
          };
        }),

      applyOverlap: (key: string, analysis: OverlapAnalysis) =>
        set((state: EvidenceState) => ({
          overlap: { ...state.overlap, [key]: analysis },
        })),

      setProposals: (key: string, proposals: IntegrationProposal[]) =>
        set((state: EvidenceState) => ({
          proposals: { ...state.proposals, [key]: proposals },
        })),

      setProposalDecision: (key: string, proposalId: string, decision: boolean) =>
        set((state: EvidenceState) => {
          const current = state.proposals[key];
          if (!current) return {};
          return {
            proposals: {
              ...state.proposals,
              [key]: current.map((p) =>
                p.id === proposalId ? { ...p, decision } : p,
              ),
            },
          };
        }),

      clearProposals: (key: string) =>
        set((state: EvidenceState) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _removed, ...rest } = state.proposals;
          return { proposals: rest };
        }),

      mergeEvidence: (key: string, queries: string[], newPapers: EvidencePaper[]) =>
        set((state: EvidenceState) => {
          const slot = state.slots[key];
          if (!slot) return {};
          const existingIds = new Set(slot.papers.map((p) => p.openAlexId));
          const additions = newPapers.filter((p) => !existingIds.has(p.openAlexId));
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: [...slot.papers, ...additions],
                searchQueries: queries,
                searchedAt: new Date().toISOString(),
              },
            },
          };
        }),

      prunePaper: (key: string, openAlexId: string) =>
        set((state: EvidenceState) => {
          const slot = state.slots[key];
          if (!slot) return {};
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: slot.papers.map((p) =>
                  p.openAlexId === openAlexId ? { ...p, status: "pruned" as const } : p,
                ),
              },
            },
          };
        }),

      restorePaper: (key: string, openAlexId: string) =>
        set((state: EvidenceState) => {
          const slot = state.slots[key];
          if (!slot) return {};
          return {
            slots: {
              ...state.slots,
              [key]: {
                ...slot,
                papers: slot.papers.map((p) =>
                  p.openAlexId === openAlexId
                    ? { ...p, status: p.reliability ? ("evaluated" as const) : ("retrieved" as const) }
                    : p,
                ),
              },
            },
          };
        }),

      clearEvidence: (key: string) =>
        set((state: EvidenceState) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _s, ...restSlots } = state.slots;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _o, ...restOverlap } = state.overlap;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _p, ...restProposals } = state.proposals;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _l, ...restLoading } = state.loading;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _sc, ...restScoring } = state.scoring;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _a, ...restAnalyzing } = state.analyzing;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _i, ...restIntegrating } = state.integrating;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _e, ...restErrors } = state.errors;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _se, ...restScoringErrors } = state.scoringErrors;
          return {
            slots: restSlots,
            overlap: restOverlap,
            proposals: restProposals,
            loading: restLoading,
            scoring: restScoring,
            analyzing: restAnalyzing,
            integrating: restIntegrating,
            errors: restErrors,
            scoringErrors: restScoringErrors,
          };
        }),

      clearAll: () => set({
        slots: {}, overlap: {}, proposals: {},
        loading: {}, scoring: {}, analyzing: {}, integrating: {}, errors: {}, scoringErrors: {},
      }),
    }),
    {
      name: "evidence-store-v1",
      version: 1,
      migrate: migrateEvidenceState,
      storage: typeof window !== "undefined"
        ? createJSONStorage(() => debouncedStorage)
        : undefined,
      // Only persist slots, overlap, and proposals — not transient loading state
      partialize: (state: EvidenceState & EvidenceActions) => ({
        slots: state.slots, overlap: state.overlap, proposals: state.proposals,
      }),
      skipHydration: true,
    },
  ),
);
