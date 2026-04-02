/**
 * SPIKE: Zustand store replacing useWorkspacePersistence
 *
 * Validates:
 * 1. persist middleware for localStorage (replaces manual debounce)
 * 2. Artifact versioning layer (edit history, undo/redo)
 * 3. Compatibility with PipelineAccessors pattern
 * 4. SSR-safe hydration (skipHydration + manual rehydrate)
 * 5. Snapshot/restore for workspace sessions
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { VerificationStatus, ArtifactType } from "@/app/lib/types/session";
import type { PersistedDecomposition } from "@/app/lib/types/persistence";

// ---------------------------------------------------------------------------
// Artifact versioning types
// ---------------------------------------------------------------------------

type ArtifactVersion = {
  id: string;
  content: string;
  createdAt: string;
  source: "generated" | "ai-edit" | "manual-edit";
  editInstruction?: string;
};

type ArtifactRecord = {
  type: ArtifactType;
  currentVersionIndex: number; // pointer into versions[]
  versions: ArtifactVersion[]; // oldest-first, capped at MAX_VERSIONS
};

const MAX_VERSIONS = 20;

function makeVersion(
  content: string,
  source: ArtifactVersion["source"],
  instruction?: string,
): ArtifactVersion {
  return {
    id: crypto.randomUUID(),
    content,
    createdAt: new Date().toISOString(),
    source,
    editInstruction: instruction,
  };
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type ArtifactKey =
  | "causal-graph"
  | "statistical-model"
  | "property-tests"
  | "balanced-perspectives"
  | "counterexamples";

interface WorkspaceState {
  // --- Source inputs ---
  sourceText: string;
  extractedFiles: { name: string; text: string }[];
  contextText: string;

  // --- Deductive artifacts (legacy flat fields, kept for pipeline compat) ---
  semiformalText: string;
  leanCode: string;
  semiformalDirty: boolean;
  verificationStatus: VerificationStatus;
  verificationErrors: string;

  // --- Structured artifacts (with versioning) ---
  artifacts: Partial<Record<ArtifactKey, ArtifactRecord>>;

  // --- Decomposition ---
  decomposition: PersistedDecomposition;
}

interface WorkspaceActions {
  // Simple setters
  setSourceText: (v: string) => void;
  setExtractedFiles: (v: { name: string; text: string }[]) => void;
  setContextText: (v: string) => void;
  setSemiformalText: (v: string | ((prev: string) => string)) => void;
  setLeanCode: (v: string | ((prev: string) => string)) => void;
  setSemiformalDirty: (v: boolean) => void;
  setVerificationStatus: (v: VerificationStatus) => void;
  setVerificationErrors: (v: string) => void;

  // Artifact versioning
  setArtifactGenerated: (key: ArtifactKey, content: string) => void;
  setArtifactEdited: (key: ArtifactKey, content: string, source: "ai-edit" | "manual-edit", instruction?: string) => void;
  undoArtifact: (key: ArtifactKey) => void;
  redoArtifact: (key: ArtifactKey) => void;
  getArtifactContent: (key: ArtifactKey) => string | null;
  canUndo: (key: ArtifactKey) => boolean;
  canRedo: (key: ArtifactKey) => boolean;

  // Decomposition
  setDecomposition: (d: PersistedDecomposition) => void;

  // Snapshot/restore (for workspace sessions)
  getSnapshot: () => WorkspaceState;
  resetToSnapshot: (data: WorkspaceState) => void;
  clearWorkspace: () => void;
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const DEFAULT_STATE: WorkspaceState = {
  sourceText: "",
  extractedFiles: [],
  contextText: "",
  semiformalText: "",
  leanCode: "",
  semiformalDirty: false,
  verificationStatus: "none",
  verificationErrors: "",
  artifacts: {},
  decomposition: {
    nodes: [],
    selectedNodeId: null,
    paperText: "",
    sources: [],
  },
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      // --- Simple setters ---
      setSourceText: (v) => set({ sourceText: v }),
      setExtractedFiles: (v) => set({ extractedFiles: v }),
      setContextText: (v) => set({ contextText: v }),
      setSemiformalText: (v) =>
        set((s) => ({
          semiformalText: typeof v === "function" ? v(s.semiformalText) : v,
        })),
      setLeanCode: (v) =>
        set((s) => ({
          leanCode: typeof v === "function" ? v(s.leanCode) : v,
        })),
      setSemiformalDirty: (v) => set({ semiformalDirty: v }),
      setVerificationStatus: (v) => set({ verificationStatus: v }),
      setVerificationErrors: (v) => set({ verificationErrors: v }),

      // --- Artifact versioning ---
      setArtifactGenerated: (key, content) =>
        set((s) => {
          const existing = s.artifacts[key];
          const version = makeVersion(content, "generated");
          const versions = existing
            ? [...existing.versions.slice(-MAX_VERSIONS + 1), version]
            : [version];
          return {
            artifacts: {
              ...s.artifacts,
              [key]: {
                type: key,
                currentVersionIndex: versions.length - 1,
                versions,
              },
            },
          };
        }),

      setArtifactEdited: (key, content, source, instruction) =>
        set((s) => {
          const existing = s.artifacts[key];
          if (!existing) {
            // No existing record — create one with this edit as first version
            const version = makeVersion(content, source, instruction);
            return {
              artifacts: {
                ...s.artifacts,
                [key]: { type: key, currentVersionIndex: 0, versions: [version] },
              },
            };
          }
          // Truncate any "future" versions (redo history) when making a new edit
          const version = makeVersion(content, source, instruction);
          const truncated = existing.versions.slice(0, existing.currentVersionIndex + 1);
          const versions = [...truncated.slice(-MAX_VERSIONS + 1), version];
          return {
            artifacts: {
              ...s.artifacts,
              [key]: {
                type: key,
                currentVersionIndex: versions.length - 1,
                versions,
              },
            },
          };
        }),

      undoArtifact: (key) =>
        set((s) => {
          const rec = s.artifacts[key];
          if (!rec || rec.currentVersionIndex <= 0) return s;
          return {
            artifacts: {
              ...s.artifacts,
              [key]: { ...rec, currentVersionIndex: rec.currentVersionIndex - 1 },
            },
          };
        }),

      redoArtifact: (key) =>
        set((s) => {
          const rec = s.artifacts[key];
          if (!rec || rec.currentVersionIndex >= rec.versions.length - 1) return s;
          return {
            artifacts: {
              ...s.artifacts,
              [key]: { ...rec, currentVersionIndex: rec.currentVersionIndex + 1 },
            },
          };
        }),

      getArtifactContent: (key) => {
        const rec = get().artifacts[key];
        if (!rec) return null;
        return rec.versions[rec.currentVersionIndex]?.content ?? null;
      },

      canUndo: (key) => {
        const rec = get().artifacts[key];
        return !!rec && rec.currentVersionIndex > 0;
      },

      canRedo: (key) => {
        const rec = get().artifacts[key];
        return !!rec && rec.currentVersionIndex < rec.versions.length - 1;
      },

      // --- Decomposition ---
      setDecomposition: (d) => set({ decomposition: d }),

      // --- Snapshot/restore ---
      getSnapshot: () => {
        const s = get();
        return {
          sourceText: s.sourceText,
          extractedFiles: s.extractedFiles.map(({ name, text }) => ({ name, text })),
          contextText: s.contextText,
          semiformalText: s.semiformalText,
          leanCode: s.leanCode,
          semiformalDirty: s.semiformalDirty,
          verificationStatus: s.verificationStatus,
          verificationErrors: s.verificationErrors,
          artifacts: structuredClone(s.artifacts),
          decomposition: structuredClone(s.decomposition),
        };
      },

      resetToSnapshot: (data) => set({ ...data }),

      clearWorkspace: () => set({ ...DEFAULT_STATE }),
    }),
    {
      name: "workspace-zustand-v1", // localStorage key
      storage: createJSONStorage(() => localStorage),
      // skipHydration: true — SSR safe. Call rehydrate() in a useEffect.
      skipHydration: true,
      // Only persist data, not actions
      partialize: (state) => ({
        sourceText: state.sourceText,
        extractedFiles: state.extractedFiles,
        contextText: state.contextText,
        semiformalText: state.semiformalText,
        leanCode: state.leanCode,
        semiformalDirty: state.semiformalDirty,
        verificationStatus: state.verificationStatus,
        verificationErrors: state.verificationErrors,
        artifacts: state.artifacts,
        decomposition: state.decomposition,
      }),
    },
  ),
);
