"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { PersistedWorkspace, PersistedDecomposition } from "@/app/lib/types/persistence";
import type { VerificationStatus } from "@/app/lib/types/session";
import { loadWorkspace, saveWorkspace, type ArtifactPersistenceData, type SaveWorkspaceInput } from "@/app/lib/utils/workspacePersistence";
import type { CustomArtifactTypeDefinition, CustomArtifactTypeId } from "@/app/lib/types/customArtifact";

type WorkspaceState = {
  sourceText: string;
  extractedFiles: { name: string; text: string; file?: File }[];
  contextText: string;
  semiformalText: string;
  leanCode: string;
  semiformalDirty: boolean;
  verificationStatus: VerificationStatus;
  verificationErrors: string;
  // Artifact data (JSON-stringified)
  causalGraph: string | null;
  statisticalModel: string | null;
  propertyTests: string | null;
  dialecticalMap: string | null;
  counterexamples: string | null;
  // Custom artifact types
  customArtifactTypes: CustomArtifactTypeDefinition[];
  customArtifactData: Record<string, string | null>;
};

const DEFAULT_STATE: WorkspaceState = {
  sourceText: "",
  extractedFiles: [],
  contextText: "",
  semiformalText: "",
  leanCode: "",
  semiformalDirty: false,
  verificationStatus: "none",
  verificationErrors: "",
  causalGraph: null,
  statisticalModel: null,
  propertyTests: null,
  dialecticalMap: null,
  counterexamples: null,
  customArtifactTypes: [],
  customArtifactData: {},
};

export function useWorkspacePersistence() {
  const [state, setState] = useState<WorkspaceState>(DEFAULT_STATE);

  // Decomposition state tracked via ref (owned by useDecomposition, mirrored here for persistence)
  const decompRef = useRef<PersistedDecomposition>({
    nodes: [],
    selectedNodeId: null,
    paperText: "",
    sources: [],
  });

  // Restored decomposition state — set once on mount, consumed by page.tsx to call resetState
  const [restoredDecompState, setRestoredDecompState] = useState<PersistedDecomposition | null>(null);

  // --- Hydrate from localStorage on mount ---
  // This is the standard Next.js pattern: render SSR-safe defaults first, then
  // hydrate from localStorage in a mount effect to avoid hydration mismatch.
  useEffect(() => {
    const data = loadWorkspace();
    if (!data) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration from external store (localStorage); must run post-mount to avoid SSR mismatch
    setState({
      sourceText: data.sourceText,
      extractedFiles: data.extractedFiles,
      contextText: data.contextText,
      semiformalText: data.semiformalText,
      leanCode: data.leanCode,
      semiformalDirty: data.semiformalDirty,
      verificationStatus: data.verificationStatus,
      verificationErrors: data.verificationErrors,
      causalGraph: data.causalGraph,
      statisticalModel: data.statisticalModel,
      propertyTests: data.propertyTests,
      dialecticalMap: data.dialecticalMap,
      counterexamples: data.counterexamples,
      customArtifactTypes: data.customArtifactTypes ?? [],
      customArtifactData: data.customArtifactData ?? {},
    });

    decompRef.current = data.decomposition;
    setRestoredDecompState(data.decomposition);
  }, []);

  // --- Debounced save on change ---
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref to current state so scheduleSave always reads fresh data
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const artifactData: ArtifactPersistenceData = useMemo(() => ({
    causalGraph: state.causalGraph,
    statisticalModel: state.statisticalModel,
    propertyTests: state.propertyTests,
    dialecticalMap: state.dialecticalMap,
    counterexamples: state.counterexamples,
    customArtifactData: state.customArtifactData,
  }), [state.causalGraph, state.statisticalModel, state.propertyTests, state.dialecticalMap, state.counterexamples, state.customArtifactData]);

  const artifactRef = useRef(artifactData);
  useEffect(() => { artifactRef.current = artifactData; }, [artifactData]);

  // Stable save scheduler — reads from refs, never changes identity
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const s = stateRef.current;
      const input: SaveWorkspaceInput = {
        sourceText: s.sourceText,
        extractedFiles: s.extractedFiles,
        contextText: s.contextText,
        semiformalText: s.semiformalText,
        leanCode: s.leanCode,
        semiformalDirty: s.semiformalDirty,
        verificationStatus: s.verificationStatus,
        verificationErrors: s.verificationErrors,
        decomposition: decompRef.current,
        artifacts: artifactRef.current,
        customArtifactTypes: s.customArtifactTypes,
      };
      saveWorkspace(input);
    }, 500);
  }, []);

  useEffect(() => {
    scheduleSave();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, artifactData, scheduleSave]);

  /** Call this whenever decomposition state changes so persistence stays in sync */
  const persistDecompState = useCallback((decompState: PersistedDecomposition) => {
    decompRef.current = decompState;
    scheduleSave();
  }, [scheduleSave]);

  // --- Individual setters that match the useState API page.tsx expects ---
  const setSourceText = useCallback((v: string) => setState((s) => ({ ...s, sourceText: v })), []);
  const setExtractedFiles = useCallback((v: { name: string; text: string; file?: File }[]) => setState((s) => ({ ...s, extractedFiles: v })), []);
  const setContextText = useCallback((v: string) => setState((s) => ({ ...s, contextText: v })), []);
  const setSemiformalText = useCallback((v: string | ((prev: string) => string)) =>
    setState((s) => ({ ...s, semiformalText: typeof v === "function" ? v(s.semiformalText) : v })), []);
  const setLeanCode = useCallback((v: string | ((prev: string) => string)) =>
    setState((s) => ({ ...s, leanCode: typeof v === "function" ? v(s.leanCode) : v })), []);
  const setSemiformalDirty = useCallback((v: boolean | ((prev: boolean) => boolean)) =>
    setState((s) => ({ ...s, semiformalDirty: typeof v === "function" ? v(s.semiformalDirty) : v })), []);
  const setVerificationStatus = useCallback((v: VerificationStatus) => setState((s) => ({ ...s, verificationStatus: v })), []);
  const setVerificationErrors = useCallback((v: string) => setState((s) => ({ ...s, verificationErrors: v })), []);
  const setCausalGraph = useCallback((v: string | null) => setState((s) => ({ ...s, causalGraph: v })), []);
  const setStatisticalModel = useCallback((v: string | null) => setState((s) => ({ ...s, statisticalModel: v })), []);
  const setPropertyTests = useCallback((v: string | null) => setState((s) => ({ ...s, propertyTests: v })), []);
  const setDialecticalMap = useCallback((v: string | null) => setState((s) => ({ ...s, dialecticalMap: v })), []);
  const setCounterexamples = useCallback((v: string | null) => setState((s) => ({ ...s, counterexamples: v })), []);

  // --- Custom artifact type management ---
  const setCustomArtifactTypes = useCallback((v: CustomArtifactTypeDefinition[]) =>
    setState((s) => ({ ...s, customArtifactTypes: v })), []);
  const addCustomArtifactType = useCallback((def: CustomArtifactTypeDefinition) =>
    setState((s) => ({ ...s, customArtifactTypes: [...s.customArtifactTypes, def] })), []);
  const updateCustomArtifactType = useCallback((id: string, updates: Partial<CustomArtifactTypeDefinition>) =>
    setState((s) => {
      const old = s.customArtifactTypes.find((ct) => ct.id === id);
      // Clear generated data if the system prompt changed (output is now stale)
      const promptChanged = updates.systemPrompt != null && old && updates.systemPrompt !== old.systemPrompt;
      return {
        ...s,
        customArtifactTypes: s.customArtifactTypes.map((ct) =>
          ct.id === id ? { ...ct, ...updates, updatedAt: new Date().toISOString() } : ct,
        ),
        ...(promptChanged ? { customArtifactData: { ...s.customArtifactData, [id]: null } } : {}),
      };
    }), []);
  const removeCustomArtifactType = useCallback((id: string) =>
    setState((s) => ({
      ...s,
      customArtifactTypes: s.customArtifactTypes.filter((ct) => ct.id !== id),
      customArtifactData: Object.fromEntries(
        Object.entries(s.customArtifactData).filter(([k]) => k !== id),
      ),
    })), []);
  const setCustomArtifactContent = useCallback((id: CustomArtifactTypeId, content: string | null) =>
    setState((s) => {
      if (s.customArtifactData[id] === content) return s;
      return { ...s, customArtifactData: { ...s.customArtifactData, [id]: content } };
    }), []);

  /** Build a PersistedWorkspace snapshot of the current state (synchronous) */
  const getSnapshot = useCallback((): PersistedWorkspace => {
    const s = stateRef.current;
    const a = artifactRef.current;
    return {
      version: 2,
      sourceText: s.sourceText,
      extractedFiles: s.extractedFiles.map(({ name, text }) => ({ name, text })),
      contextText: s.contextText,
      semiformalText: s.semiformalText,
      leanCode: s.leanCode,
      semiformalDirty: s.semiformalDirty,
      verificationStatus: s.verificationStatus === "verifying" ? "none" : s.verificationStatus,
      verificationErrors: s.verificationErrors,
      decomposition: { ...decompRef.current },
      causalGraph: a.causalGraph,
      statisticalModel: a.statisticalModel,
      propertyTests: a.propertyTests,
      dialecticalMap: a.dialecticalMap,
      counterexamples: a.counterexamples,
      customArtifactTypes: s.customArtifactTypes,
      customArtifactData: a.customArtifactData ?? {},
    };
  }, []);

  /** Replace all workspace state from a snapshot (used when switching workspace sessions) */
  const resetToSnapshot = useCallback((data: PersistedWorkspace): PersistedDecomposition => {
    // Cancel any pending debounced save
    if (timerRef.current) clearTimeout(timerRef.current);

    setState({
      sourceText: data.sourceText,
      extractedFiles: data.extractedFiles,
      contextText: data.contextText,
      semiformalText: data.semiformalText,
      leanCode: data.leanCode,
      semiformalDirty: data.semiformalDirty,
      verificationStatus: data.verificationStatus,
      verificationErrors: data.verificationErrors,
      causalGraph: data.causalGraph,
      statisticalModel: data.statisticalModel,
      propertyTests: data.propertyTests,
      dialecticalMap: data.dialecticalMap,
      counterexamples: data.counterexamples,
      customArtifactTypes: data.customArtifactTypes ?? [],
      customArtifactData: data.customArtifactData ?? {},
    });

    decompRef.current = data.decomposition;

    // Write to localStorage immediately (no debounce for session switches)
    saveWorkspace({
      sourceText: data.sourceText,
      extractedFiles: data.extractedFiles,
      contextText: data.contextText,
      semiformalText: data.semiformalText,
      leanCode: data.leanCode,
      semiformalDirty: data.semiformalDirty,
      verificationStatus: data.verificationStatus,
      verificationErrors: data.verificationErrors,
      decomposition: data.decomposition,
      artifacts: {
        causalGraph: data.causalGraph,
        statisticalModel: data.statisticalModel,
        propertyTests: data.propertyTests,
        dialecticalMap: data.dialecticalMap,
        counterexamples: data.counterexamples,
        customArtifactData: data.customArtifactData ?? {},
      },
      customArtifactTypes: data.customArtifactTypes ?? [],
    });

    return data.decomposition;
  }, []);

  /** Clear all workspace state back to defaults */
  const clearWorkspace = useCallback((): PersistedDecomposition => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setState(DEFAULT_STATE);

    const emptyDecomp: PersistedDecomposition = { nodes: [], selectedNodeId: null, paperText: "", sources: [] };
    decompRef.current = emptyDecomp;

    saveWorkspace({
      ...DEFAULT_STATE,
      decomposition: emptyDecomp,
    });

    return emptyDecomp;
  }, []);

  // Stable return object that destructures the same as before
  return useMemo(() => ({
    sourceText: state.sourceText,
    setSourceText,
    extractedFiles: state.extractedFiles,
    setExtractedFiles,
    contextText: state.contextText,
    setContextText,
    semiformalText: state.semiformalText,
    setSemiformalText,
    leanCode: state.leanCode,
    setLeanCode,
    semiformalDirty: state.semiformalDirty,
    setSemiformalDirty,
    verificationStatus: state.verificationStatus,
    setVerificationStatus,
    verificationErrors: state.verificationErrors,
    setVerificationErrors,
    causalGraph: state.causalGraph,
    setCausalGraph,
    statisticalModel: state.statisticalModel,
    setStatisticalModel,
    propertyTests: state.propertyTests,
    setPropertyTests,
    dialecticalMap: state.dialecticalMap,
    setDialecticalMap,
    counterexamples: state.counterexamples,
    setCounterexamples,
    customArtifactTypes: state.customArtifactTypes,
    setCustomArtifactTypes,
    addCustomArtifactType,
    updateCustomArtifactType,
    removeCustomArtifactType,
    customArtifactData: state.customArtifactData,
    setCustomArtifactContent,
    restoredDecompState,
    persistDecompState,
    getSnapshot,
    resetToSnapshot,
    clearWorkspace,
  }), [state, restoredDecompState, persistDecompState, setSourceText, setExtractedFiles, setContextText, setSemiformalText, setLeanCode, setSemiformalDirty, setVerificationStatus, setVerificationErrors, setCausalGraph, setStatisticalModel, setPropertyTests, setDialecticalMap, setCounterexamples, setCustomArtifactTypes, addCustomArtifactType, updateCustomArtifactType, removeCustomArtifactType, setCustomArtifactContent, getSnapshot, resetToSnapshot, clearWorkspace]);
}
