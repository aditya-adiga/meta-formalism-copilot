"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { PersistedDecomposition } from "@/app/lib/types/persistence";
import type { VerificationStatus } from "@/app/lib/types/session";
import { loadWorkspace, saveWorkspace, type ArtifactPersistenceData, type SaveWorkspaceInput } from "@/app/lib/utils/workspacePersistence";

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
  perspectiveBalance: string | null;
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
  perspectiveBalance: null,
};

export function useWorkspacePersistence() {
  const [state, setState] = useState<WorkspaceState>(DEFAULT_STATE);

  // Decomposition state tracked via ref (owned by useDecomposition, mirrored here for persistence)
  const decompRef = useRef<PersistedDecomposition>({
    nodes: [],
    selectedNodeId: null,
    paperText: "",
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
      perspectiveBalance: data.perspectiveBalance,
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
    perspectiveBalance: state.perspectiveBalance,
  }), [state.causalGraph, state.statisticalModel, state.propertyTests, state.perspectiveBalance]);

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
  const setPerspectiveBalance = useCallback((v: string | null) => setState((s) => ({ ...s, perspectiveBalance: v })), []);

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
    perspectiveBalance: state.perspectiveBalance,
    setPerspectiveBalance,
    restoredDecompState,
    persistDecompState,
  }), [state, restoredDecompState, persistDecompState, setSourceText, setExtractedFiles, setContextText, setSemiformalText, setLeanCode, setSemiformalDirty, setVerificationStatus, setVerificationErrors, setCausalGraph, setStatisticalModel, setPropertyTests, setPerspectiveBalance]);
}
