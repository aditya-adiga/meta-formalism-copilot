/**
 * Zustand workspace store — replaces useWorkspacePersistence.
 *
 * Key design decisions:
 * - persist middleware handles serialization lifecycle; custom debounced storage adapter rate-limits writes
 * - skipHydration: true for Next.js SSR safety (call rehydrate() in useEffect)
 * - partialize excludes action functions from persistence
 * - Structured artifacts use ArtifactRecord with version history (undo/redo)
 * - Semiformal/lean kept as flat strings for pipeline compatibility
 * - Streaming preview state stays outside this store (keep transient state local)
 *
 * See docs/decisions/006-zustand-state-management.md for rationale.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { VerificationStatus } from "@/app/lib/types/session";
import type { PersistedDecomposition, PersistedWorkspace } from "@/app/lib/types/persistence";
import type { ArtifactKey, ArtifactVersion, ArtifactRecord } from "@/app/lib/types/artifactStore";
import { MAX_VERSIONS } from "@/app/lib/types/artifactStore";
import type { CustomArtifactTypeDefinition, CustomArtifactTypeId } from "@/app/lib/types/customArtifact";
import type { GenerationProvenance } from "@/app/lib/utils/provenance";
import { loadWorkspace, sanitizeVerificationStatus, sanitizeNodeStatus, coerceDecomposition } from "@/app/lib/utils/workspacePersistence";
import { WORKSPACE_KEY } from "@/app/lib/types/persistence";
import type { PropositionNode } from "@/app/lib/types/decomposition";

// ---------------------------------------------------------------------------
// Debounced localStorage adapter — avoids JSON.stringify on every keystroke.
// Reads are synchronous (instant); writes are debounced by 300ms.
// ---------------------------------------------------------------------------

function createDebouncedStorage(): {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
} {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        try {
          localStorage.setItem(name, value);
        } catch (e) {
          console.warn("Failed to persist workspace (localStorage quota exceeded):", e);
        }
        pending = null;
      }, 300);
    },
    removeItem: (name) => {
      if (pending) clearTimeout(pending);
      pending = null;
      localStorage.removeItem(name);
    },
  };
}

// ---------------------------------------------------------------------------
// Rehydration validation — coerce deserialized localStorage data to safe types.
// Reuses coerceDecomposition from workspacePersistence for thorough node validation.
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const VALID_ARTIFACT_SOURCES = new Set(["generated", "ai-edit", "manual-edit"]);

/** Validate an individual ArtifactVersion from deserialized JSON. */
function coerceArtifactVersion(raw: unknown): ArtifactVersion | null {
  if (!isObject(raw)) return null;
  if (typeof raw.content !== "string") return null;
  if (typeof raw.id !== "string") return null;
  // Preserve provenance if present and well-formed
  let provenance: GenerationProvenance | undefined;
  if (isObject(raw.provenance) && typeof (raw.provenance as Record<string, unknown>).inputHash === "string") {
    const p = raw.provenance as Record<string, unknown>;
    provenance = {
      inputHash: p.inputHash as string,
      generatedAt: typeof p.generatedAt === "string" ? p.generatedAt : "",
    };
  }

  return {
    id: raw.id,
    content: raw.content,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    source: VALID_ARTIFACT_SOURCES.has(raw.source as string) ? raw.source as ArtifactVersion["source"] : "generated",
    editInstruction: typeof raw.editInstruction === "string" ? raw.editInstruction : undefined,
    provenance,
  };
}

/** Validate and coerce an ArtifactRecord from deserialized JSON. */
function coerceArtifactRecord(raw: unknown, key: ArtifactKey): ArtifactRecord | undefined {
  if (!isObject(raw)) return undefined;
  const versions = Array.isArray(raw.versions)
    ? (raw.versions as unknown[]).map(coerceArtifactVersion).filter((v): v is ArtifactVersion => v !== null)
    : [];
  if (versions.length === 0) return undefined;
  const idx = typeof raw.currentVersionIndex === "number" ? raw.currentVersionIndex : versions.length - 1;
  return {
    type: key,
    versions,
    currentVersionIndex: Math.max(0, Math.min(idx, versions.length - 1)),
  };
}

/** Coerce deserialized persisted state to safe types before merging into the store. */
function coercePersistedState(persisted: Record<string, unknown>): Partial<WorkspaceState> {
  const result: Partial<WorkspaceState> = {};

  if (typeof persisted.sourceText === "string") result.sourceText = persisted.sourceText;
  if (Array.isArray(persisted.extractedFiles)) {
    result.extractedFiles = (persisted.extractedFiles as unknown[]).filter(isObject).map((f) => ({
      name: typeof f.name === "string" ? f.name : "",
      text: typeof f.text === "string" ? f.text : "",
    }));
  }
  if (typeof persisted.contextText === "string") result.contextText = persisted.contextText;
  if (typeof persisted.semiformalText === "string") result.semiformalText = persisted.semiformalText;
  if (typeof persisted.leanCode === "string") result.leanCode = persisted.leanCode;
  if (typeof persisted.semiformalDirty === "boolean") result.semiformalDirty = persisted.semiformalDirty;
  if (isObject(persisted.semiformalProvenance) && typeof (persisted.semiformalProvenance as Record<string, unknown>).inputHash === "string") {
    const p = persisted.semiformalProvenance as Record<string, unknown>;
    result.semiformalProvenance = {
      inputHash: p.inputHash as string,
      generatedAt: typeof p.generatedAt === "string" ? p.generatedAt : "",
    };
  }
  if (typeof persisted.verificationStatus === "string") {
    result.verificationStatus = sanitizeVerificationStatus(persisted.verificationStatus);
  }
  if (typeof persisted.verificationErrors === "string") result.verificationErrors = persisted.verificationErrors;

  // Validate artifact records
  if (isObject(persisted.artifacts)) {
    const artifacts: Partial<Record<ArtifactKey, ArtifactRecord>> = {};
    const validKeys: ArtifactKey[] = ["causal-graph", "statistical-model", "property-tests", "dialectical-map", "counterexamples"];
    for (const key of validKeys) {
      const rec = coerceArtifactRecord((persisted.artifacts as Record<string, unknown>)[key], key);
      if (rec) artifacts[key] = rec;
    }
    result.artifacts = artifacts;
  }

  // Decomposition — reuse the thorough field-by-field coercion from workspacePersistence
  if (isObject(persisted.decomposition)) {
    result.decomposition = coerceDecomposition(persisted.decomposition);
  }

  // Custom artifact types — accept only entries whose id begins with "custom-"
  if (Array.isArray(persisted.customArtifactTypes)) {
    result.customArtifactTypes = (persisted.customArtifactTypes as unknown[])
      .filter(isObject)
      .filter((c) => typeof c.id === "string" && (c.id as string).startsWith("custom-"))
      .map((c) => c as unknown as CustomArtifactTypeDefinition);
  }
  if (isObject(persisted.customArtifactData)) {
    const data: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(persisted.customArtifactData)) {
      if (k.startsWith("custom-") && (typeof v === "string" || v === null)) data[k] = v;
    }
    result.customArtifactData = data;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the current version content from an ArtifactRecord. */
export function resolveArtifactContent(rec: ArtifactRecord | undefined): string | null {
  if (!rec) return null;
  return rec.versions[rec.currentVersionIndex]?.content ?? null;
}

/** Resolve the current version's provenance from an ArtifactRecord. */
export function resolveArtifactProvenance(rec: ArtifactRecord | undefined): GenerationProvenance | undefined {
  if (!rec) return undefined;
  return rec.versions[rec.currentVersionIndex]?.provenance;
}

export function makeVersion(
  content: string,
  source: ArtifactVersion["source"],
  instruction?: string,
  provenance?: GenerationProvenance,
): ArtifactVersion {
  return {
    id: crypto.randomUUID(),
    content,
    createdAt: new Date().toISOString(),
    source,
    editInstruction: instruction,
    provenance,
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

  // --- Provenance ---
  semiformalProvenance: GenerationProvenance | null;

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
  setExtractedFiles: (v: { name: string; text: string; file?: File }[]) => void;
  setContextText: (v: string) => void;
  setSemiformalText: (v: string | ((prev: string) => string)) => void;
  setLeanCode: (v: string | ((prev: string) => string)) => void;
  setSemiformalDirty: (v: boolean | ((prev: boolean) => boolean)) => void;
  setVerificationStatus: (v: VerificationStatus) => void;
  setVerificationErrors: (v: string) => void;

  // Provenance
  setSemiformalProvenance: (v: GenerationProvenance | null) => void;

  // Artifact versioning
  setArtifactGenerated: (key: ArtifactKey, content: string, provenance?: GenerationProvenance) => void;
  setArtifactsBatchGenerated: (entries: Array<{ key: ArtifactKey; content: string }>, provenance?: GenerationProvenance) => void;
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
  semiformalProvenance: null,
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

/** Map from PersistedWorkspace flat fields to versioned ArtifactKey */
export const PERSISTED_ARTIFACT_FIELDS: Record<string, ArtifactKey> = {
  causalGraph: "causal-graph",
  statisticalModel: "statistical-model",
  propertyTests: "property-tests",
  dialecticalMap: "dialectical-map",
  counterexamples: "counterexamples",
};

/**
 * Migrate data from workspace-v2 localStorage format into the Zustand store.
 * Called once on app load if the Zustand key is absent but workspace-v2 exists.
 */
export function migrateFromV2(): boolean {
  const old = loadWorkspace();
  if (!old) return false;

  // Build versioned artifact records from flat PersistedWorkspace strings
  const artifacts: Partial<Record<ArtifactKey, ArtifactRecord>> = {};
  for (const [field, key] of Object.entries(PERSISTED_ARTIFACT_FIELDS)) {
    const content = old[field as keyof PersistedWorkspace];
    if (typeof content === "string" && content) {
      artifacts[key] = {
        type: key,
        currentVersionIndex: 0,
        versions: [makeVersion(content, "generated")],
      };
    }
  }

  // Single setState call — matches the batching pattern in resetWorkspaceToSnapshot
  useWorkspaceStore.setState({
    sourceText: old.sourceText,
    extractedFiles: old.extractedFiles,
    contextText: old.contextText,
    semiformalText: old.semiformalText,
    leanCode: old.leanCode,
    semiformalDirty: old.semiformalDirty,
    verificationStatus: old.verificationStatus,
    verificationErrors: old.verificationErrors,
    decomposition: old.decomposition,
    artifacts,
    customArtifactTypes: old.customArtifactTypes ?? [],
    customArtifactData: old.customArtifactData ?? {},
  });

  return true;
}

// ---------------------------------------------------------------------------
// Partialize memoization — avoid re-mapping decomposition nodes on every set()
// when only unrelated fields (e.g., sourceText) changed.
// ---------------------------------------------------------------------------

let _lastDecompRef: PersistedDecomposition | null = null;
let _lastDecompSanitized: PersistedDecomposition | null = null;

function sanitizeDecomposition(decomposition: PersistedDecomposition): PersistedDecomposition {
  if (decomposition === _lastDecompRef && _lastDecompSanitized) {
    return _lastDecompSanitized;
  }
  const result = {
    ...decomposition,
    nodes: decomposition.nodes.map((n: PropositionNode) => ({
      ...n,
      verificationStatus: sanitizeNodeStatus(n.verificationStatus),
    })),
  };
  _lastDecompRef = decomposition;
  _lastDecompSanitized = result;
  return result;
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

      // --- Provenance ---
      setSemiformalProvenance: (v) => set({ semiformalProvenance: v }),

      // --- Artifact versioning ---
      setArtifactGenerated: (key, content, provenance?) =>
        set((s) => {
          const existing = s.artifacts[key];
          const version = makeVersion(content, "generated", undefined, provenance);
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

      setArtifactsBatchGenerated: (entries, provenance?) =>
        set((s) => {
          const updated = { ...s.artifacts };
          for (const { key, content } of entries) {
            const existing = updated[key];
            const version = makeVersion(content, "generated", undefined, provenance);
            const versions = existing
              ? [...existing.versions.slice(-MAX_VERSIONS + 1), version]
              : [version];
            updated[key] = { type: key, currentVersionIndex: versions.length - 1, versions };
          }
          return { artifacts: updated };
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

      getArtifactContent: (key) => resolveArtifactContent(get().artifacts[key]),

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
          semiformalProvenance: s.semiformalProvenance,
          verificationStatus: sanitizeVerificationStatus(s.verificationStatus),
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
      storage: createJSONStorage(createDebouncedStorage),
      // SSR safe: render defaults first, hydrate in useEffect via rehydrate()
      skipHydration: true,
      // Validate deserialized localStorage data before merging into the store.
      // Reuses coerceDecomposition from workspacePersistence for node-level field validation.
      merge: (persisted, current) => ({
        ...current,
        ...(isObject(persisted) ? coercePersistedState(persisted as Record<string, unknown>) : {}),
      }),
      // Only persist data fields, not action functions
      // File references on extractedFiles are non-serializable and dropped by JSON.stringify,
      // so no need to .map() here — save the allocation on every set() call.
      partialize: (state) => ({
        sourceText: state.sourceText,
        extractedFiles: state.extractedFiles,
        contextText: state.contextText,
        semiformalText: state.semiformalText,
        leanCode: state.leanCode,
        semiformalDirty: state.semiformalDirty,
        semiformalProvenance: state.semiformalProvenance,
        // Strip transient "verifying" back to "none" so a browser close during
        // verification doesn't leave the app stuck in a loading state on reload.
        verificationStatus: sanitizeVerificationStatus(state.verificationStatus),
        verificationErrors: state.verificationErrors,
        artifacts: state.artifacts,
        decomposition: sanitizeDecomposition(state.decomposition),
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
            let hasZustandData = false;
            try { hasZustandData = !!(zustandRaw && JSON.parse(zustandRaw)?.state?.sourceText); }
            catch { /* corrupted localStorage — proceed with migration */ }
            if (!hasZustandData) {
              migrateFromV2();
            }
          }
        };
      },
    },
  ),
);
