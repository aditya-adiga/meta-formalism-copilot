"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { PersistedDecomposition } from "@/app/lib/types/persistence";
import { loadWorkspace, saveWorkspace, type ArtifactPersistenceData } from "@/app/lib/utils/workspacePersistence";

type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

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
      dialecticalMap: data.dialecticalMap,
    });

    decompRef.current = data.decomposition;
    setRestoredDecompState(data.decomposition);
  }, []);

  // --- Debounced save on change ---
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const artifactData: ArtifactPersistenceData = useMemo(() => ({
    causalGraph: state.causalGraph,
    statisticalModel: state.statisticalModel,
    propertyTests: state.propertyTests,
    dialecticalMap: state.dialecticalMap,
  }), [state.causalGraph, state.statisticalModel, state.propertyTests, state.dialecticalMap]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveWorkspace(
        state.sourceText,
        state.extractedFiles,
        state.contextText,
        state.semiformalText,
        state.leanCode,
        state.semiformalDirty,
        state.verificationStatus,
        state.verificationErrors,
        decompRef.current,
        artifactData,
      );
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, artifactData]);

  /** Call this whenever decomposition state changes so persistence stays in sync */
  const persistDecompState = useCallback((decompState: PersistedDecomposition) => {
    decompRef.current = decompState;
    // Trigger a debounced save
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveWorkspace(
        state.sourceText,
        state.extractedFiles,
        state.contextText,
        state.semiformalText,
        state.leanCode,
        state.semiformalDirty,
        state.verificationStatus,
        state.verificationErrors,
        decompRef.current,
        artifactData,
      );
    }, 500);
  }, [state, artifactData]);

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
    restoredDecompState,
    persistDecompState,
  }), [state, restoredDecompState, persistDecompState, setSourceText, setExtractedFiles, setContextText, setSemiformalText, setLeanCode, setSemiformalDirty, setVerificationStatus, setVerificationErrors, setCausalGraph, setStatisticalModel, setPropertyTests, setDialecticalMap]);
}
