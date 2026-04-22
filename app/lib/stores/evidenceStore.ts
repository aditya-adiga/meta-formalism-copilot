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
import type { EvidenceSlot } from "@/app/lib/types/evidence";

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
  /** Per-element loading state */
  loading: Record<string, boolean>;
  /** Per-element error messages */
  errors: Record<string, string>;
}

interface EvidenceActions {
  setEvidence: (key: string, slot: EvidenceSlot) => void;
  setLoading: (key: string, loading: boolean) => void;
  setError: (key: string, error: string | null) => void;
  clearEvidence: (key: string) => void;
  clearAll: () => void;
}

const DEFAULT_STATE: EvidenceState = {
  slots: {},
  loading: {},
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

      setError: (key: string, error: string | null) =>
        set((state: EvidenceState) => {
          if (error === null) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [key]: _removed, ...rest } = state.errors;
            return { errors: rest };
          }
          return { errors: { ...state.errors, [key]: error } };
        }),

      clearEvidence: (key: string) =>
        set((state: EvidenceState) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _removed, ...rest } = state.slots;
          return { slots: rest };
        }),

      clearAll: () => set({ slots: {}, loading: {}, errors: {} }),
    }),
    {
      name: "evidence-store-v1",
      storage: typeof window !== "undefined"
        ? createJSONStorage(() => debouncedStorage)
        : undefined,
      // Only persist slots, not transient loading state
      partialize: (state: EvidenceState & EvidenceActions) => ({ slots: state.slots }),
      skipHydration: true,
    },
  ),
);
