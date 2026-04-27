/**
 * Zustand workspace store — replaces useWorkspacePersistence.
 *
 * Key design decisions:
 * - persist middleware replaces manual debounce/localStorage pattern
 * - skipHydration: true for Next.js SSR safety (call rehydrate() in useEffect)
 * - partialize excludes action functions from persistence
 * - Structured artifacts use ArtifactRecord with version history (undo/redo)
 * - Semiformal/lean kept as flat strings for pipeline compatibility
 * - Streaming preview state stays outside this store (persist writes on every set())
 *
 * See docs/decisions/005-zustand-state-management.md for rationale.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { VerificationStatus } from "@/app/lib/types/session";
import type { PersistedDecomposition, PersistedWorkspace } from "@/app/lib/types/persistence";
import type { ArtifactKey, ArtifactVersion, ArtifactRecord } from "@/app/lib/types/artifactStore";
import { MAX_VERSIONS } from "@/app/lib/types/artifactStore";
import type { CustomArtifactTypeDefinition, CustomArtifactTypeId } from "@/app/lib/types/customArtifact";
import { loadWorkspace } from "@/app/lib/utils/workspacePersistence";
import { WORKSPACE_KEY } from "@/app/lib/types/persistence";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

export interface WorkspaceState {
  // --- Source inputs ---
  sourceText: string;
  extractedFiles: { name: string; text: string; file?: File }[];
  contextText: string;

  // --- Deductive artifacts (flat fields for pipeline compatibility) ---
  semiformalText: string;
  leanCode: string;
  semiformalDirty: boolean;
  verificationStatus: VerificationStatus;
  verificationErrors: string;

  // --- Structured artifacts (with versioning) ---
  artifacts: Partial<Record<ArtifactKey, ArtifactRecord>>;

  // --- Decomposition ---
  decomposition: PersistedDecomposition;

  // --- Custom artifact types (user-defined via LLM-assisted designer) ---
  customArtifactTypes: CustomArtifactTypeDefinition[];
  customArtifactData: Record<string, string | null>;
}

export interface WorkspaceActions {
  // Simple setters
  setSourceText: (v: string) => void;
  setExtractedFiles: (v: { name: string; text: string }[]) => void;
  setContextText: (v: string) => void;
  setSemiformalText: (v: string | ((prev: string) => string)) => void;
  setLeanCode: (v: string | ((prev: string) => string)) => void;
  setSemiformalDirty: (v: boolean | ((prev: boolean) => boolean)) => void;
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

  // Custom artifact types
  setCustomArtifactTypes: (v: CustomArtifactTypeDefinition[]) => void;
  addCustomArtifactType: (def: CustomArtifactTypeDefinition) => void;
  updateCustomArtifactType: (id: string, updates: Partial<CustomArtifactTypeDefinition>) => void;
  removeCustomArtifactType: (id: string) => void;
  setCustomArtifactContent: (id: CustomArtifactTypeId, content: string | null) => void;

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
  customArtifactTypes: [],
  customArtifactData: {},
};

// ---------------------------------------------------------------------------
// Migration from workspace-v2 (old useWorkspacePersistence format)
// ---------------------------------------------------------------------------

/** Map from old flat persistence fields to versioned ArtifactKey */
const V2_ARTIFACT_FIELDS: Record<string, ArtifactKey> = {
  causalGraph: "causal-graph",
  statisticalModel: "statistical-model",
  propertyTests: "property-tests",
  dialecticalMap: "balanced-perspectives",
  counterexamples: "counterexamples",
};

/**
 * Migrate data from workspace-v2 localStorage format into the Zustand store.
 * Called once on app load if the Zustand key is absent but workspace-v2 exists.
 */
export function migrateFromV2(): boolean {
  const old = loadWorkspace();
  if (!old) return false;

  const store = useWorkspaceStore.getState();
  store.setSourceText(old.sourceText);
  store.setExtractedFiles(old.extractedFiles);
  store.setContextText(old.contextText);
  store.setSemiformalText(old.semiformalText);
  store.setLeanCode(old.leanCode);
  store.setSemiformalDirty(old.semiformalDirty);
  store.setVerificationStatus(old.verificationStatus);
  store.setVerificationErrors(old.verificationErrors);
  store.setDecomposition(old.decomposition);

  // Migrate flat artifact JSON strings to versioned records
  for (const [field, key] of Object.entries(V2_ARTIFACT_FIELDS)) {
    const content = old[field as keyof PersistedWorkspace];
    if (typeof content === "string" && content) {
      store.setArtifactGenerated(key, content);
    }
  }

  // Custom artifact types and data (were added to v2 as optional, so may be absent)
  if (old.customArtifactTypes && old.customArtifactTypes.length > 0) {
    store.setCustomArtifactTypes(old.customArtifactTypes);
  }
  if (old.customArtifactData) {
    for (const [id, content] of Object.entries(old.customArtifactData)) {
      store.setCustomArtifactContent(id as CustomArtifactTypeId, content);
    }
  }

  return true;
}

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
      setSemiformalDirty: (v) =>
        set((s) => ({
          semiformalDirty: typeof v === "function" ? v(s.semiformalDirty) : v,
        })),
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
            const version = makeVersion(content, source, instruction);
            return {
              artifacts: {
                ...s.artifacts,
                [key]: { type: key, currentVersionIndex: 0, versions: [version] },
              },
            };
          }
          // Truncate redo history when making a new edit
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

      // --- Custom artifact types ---
      setCustomArtifactTypes: (v) => set({ customArtifactTypes: v }),
      addCustomArtifactType: (def) =>
        set((s) => ({ customArtifactTypes: [...s.customArtifactTypes, def] })),
      updateCustomArtifactType: (id, updates) =>
        set((s) => {
          const old = s.customArtifactTypes.find((ct) => ct.id === id);
          // Clear generated output if the system prompt changed — stored
          // output is now stale w.r.t. the new prompt.
          const promptChanged = updates.systemPrompt != null && old && updates.systemPrompt !== old.systemPrompt;
          return {
            customArtifactTypes: s.customArtifactTypes.map((ct) =>
              ct.id === id ? { ...ct, ...updates, updatedAt: new Date().toISOString() } : ct,
            ),
            ...(promptChanged ? { customArtifactData: { ...s.customArtifactData, [id]: null } } : {}),
          };
        }),
      removeCustomArtifactType: (id) =>
        set((s) => ({
          customArtifactTypes: s.customArtifactTypes.filter((ct) => ct.id !== id),
          customArtifactData: Object.fromEntries(
            Object.entries(s.customArtifactData).filter(([k]) => k !== id),
          ),
        })),
      setCustomArtifactContent: (id, content) =>
        set((s) =>
          s.customArtifactData[id] === content
            ? s
            : { customArtifactData: { ...s.customArtifactData, [id]: content } },
        ),

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
          customArtifactTypes: structuredClone(s.customArtifactTypes),
          customArtifactData: { ...s.customArtifactData },
        };
      },

      resetToSnapshot: (data) => set({ ...data }),

      clearWorkspace: () => set({ ...DEFAULT_STATE }),
    }),
    {
      name: "workspace-zustand-v1",
      storage: createJSONStorage(() => localStorage),
      // SSR safe: render defaults first, hydrate in useEffect via rehydrate()
      skipHydration: true,
      // Only persist data fields, not action functions
      partialize: (state) => ({
        sourceText: state.sourceText,
        extractedFiles: state.extractedFiles.map(({ name, text }) => ({ name, text })),
        contextText: state.contextText,
        semiformalText: state.semiformalText,
        leanCode: state.leanCode,
        semiformalDirty: state.semiformalDirty,
        verificationStatus: state.verificationStatus,
        verificationErrors: state.verificationErrors,
        artifacts: state.artifacts,
        decomposition: state.decomposition,
        customArtifactTypes: state.customArtifactTypes,
        customArtifactData: state.customArtifactData,
      }),
      // On rehydrate, check if we need to migrate from workspace-v2
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) return;
          // If Zustand store was empty (no persisted data) but workspace-v2 exists,
          // migrate the old data. We check by looking for the old key.
          if (typeof window !== "undefined" && localStorage.getItem(WORKSPACE_KEY)) {
            const zustandRaw = localStorage.getItem("workspace-zustand-v1");
            const hasZustandData = zustandRaw && JSON.parse(zustandRaw)?.state?.sourceText;
            if (!hasZustandData) {
              migrateFromV2();
            }
          }
        };
      },
    },
  ),
);
