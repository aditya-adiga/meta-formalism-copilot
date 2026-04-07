"use client";

/**
 * Compatibility shim: delegates to the Zustand workspace store while
 * preserving the exact return API that page.tsx and other consumers expect.
 *
 * This shim exists during the migration period. Once page.tsx is wired
 * directly to useWorkspaceStore (PR 2), this file will be deleted.
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import type { PersistedWorkspace, PersistedDecomposition } from "@/app/lib/types/persistence";
import { useWorkspaceStore } from "@/app/lib/stores/workspaceStore";
import { sanitizeVerificationStatus } from "@/app/lib/utils/workspacePersistence";
import type { CustomArtifactTypeId } from "@/app/lib/types/customArtifact";

export function useWorkspacePersistence() {
  // Trigger Zustand rehydrate once on mount (SSR-safe pattern)
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      useWorkspaceStore.persist.rehydrate();
    }
  }, []);

  // Subscribe to Zustand store fields that the old API exposed
  const sourceText = useWorkspaceStore((s) => s.sourceText);
  const extractedFiles = useWorkspaceStore((s) => s.extractedFiles);
  const contextText = useWorkspaceStore((s) => s.contextText);
  const semiformalText = useWorkspaceStore((s) => s.semiformalText);
  const leanCode = useWorkspaceStore((s) => s.leanCode);
  const semiformalDirty = useWorkspaceStore((s) => s.semiformalDirty);
  const verificationStatus = useWorkspaceStore((s) => s.verificationStatus);
  const verificationErrors = useWorkspaceStore((s) => s.verificationErrors);
  const decomposition = useWorkspaceStore((s) => s.decomposition);

  // Custom artifact types (user-defined)
  const customArtifactTypes = useWorkspaceStore((s) => s.customArtifactTypes);
  const customArtifactData = useWorkspaceStore((s) => s.customArtifactData);
  const addCustomArtifactType = useWorkspaceStore((s) => s.addCustomArtifactType);
  const updateCustomArtifactType = useWorkspaceStore((s) => s.updateCustomArtifactType);
  const removeCustomArtifactType = useWorkspaceStore((s) => s.removeCustomArtifactType);
  const setCustomArtifactContent = useWorkspaceStore((s) => s.setCustomArtifactContent);

  // Artifact content (read from versioned store, exposed as flat strings)
  const causalGraph = useWorkspaceStore((s) => s.getArtifactContent("causal-graph"));
  const statisticalModel = useWorkspaceStore((s) => s.getArtifactContent("statistical-model"));
  const propertyTests = useWorkspaceStore((s) => s.getArtifactContent("property-tests"));
  const dialecticalMap = useWorkspaceStore((s) => s.getArtifactContent("dialectical-map"));
  const counterexamples = useWorkspaceStore((s) => s.getArtifactContent("counterexamples"));

  // Stable setter references from the store
  const setSourceText = useWorkspaceStore((s) => s.setSourceText);
  const setContextText = useWorkspaceStore((s) => s.setContextText);
  const setSemiformalText = useWorkspaceStore((s) => s.setSemiformalText);
  const setLeanCode = useWorkspaceStore((s) => s.setLeanCode);
  const setSemiformalDirty = useWorkspaceStore((s) => s.setSemiformalDirty);
  const setVerificationStatus = useWorkspaceStore((s) => s.setVerificationStatus);
  const setVerificationErrors = useWorkspaceStore((s) => s.setVerificationErrors);

  // extractedFiles setter: the old API accepted { name, text, file? }[] and
  // the store now carries the optional File in memory. The persist middleware's
  // partialize strips File objects before writing to localStorage.
  const setExtractedFiles = useCallback(
    (v: { name: string; text: string; file?: File }[]) => {
      useWorkspaceStore.getState().setExtractedFiles(v);
    },
    [],
  );

  // Artifact setters: map old flat-string setters to versioned store
  const setCausalGraph = useCallback(
    (v: string | null) => {
      if (v) useWorkspaceStore.getState().setArtifactGenerated("causal-graph", v);
    },
    [],
  );
  const setStatisticalModel = useCallback(
    (v: string | null) => {
      if (v) useWorkspaceStore.getState().setArtifactGenerated("statistical-model", v);
    },
    [],
  );
  const setPropertyTests = useCallback(
    (v: string | null) => {
      if (v) useWorkspaceStore.getState().setArtifactGenerated("property-tests", v);
    },
    [],
  );
  const setDialecticalMap = useCallback(
    (v: string | null) => {
      if (v) useWorkspaceStore.getState().setArtifactGenerated("dialectical-map", v);
    },
    [],
  );
  const setCounterexamples = useCallback(
    (v: string | null) => {
      if (v) useWorkspaceStore.getState().setArtifactGenerated("counterexamples", v);
    },
    [],
  );

  // Decomposition persistence: shim calls setDecomposition on the store
  const persistDecompState = useCallback(
    (decompState: PersistedDecomposition) => {
      useWorkspaceStore.getState().setDecomposition(decompState);
    },
    [],
  );

  // Restored decomposition state: non-null when persisted decomposition has nodes.
  // page.tsx guards against re-application with its own decompRestoredRef.
  const restoredDecompState: PersistedDecomposition | null =
    decomposition.nodes.length > 0 ? decomposition : null;

  // Snapshot/restore: bridge between old PersistedWorkspace format and Zustand WorkspaceState
  const getSnapshot = useCallback((): PersistedWorkspace => {
    const s = useWorkspaceStore.getState();
    return {
      version: 2,
      sourceText: s.sourceText,
      extractedFiles: s.extractedFiles.map(({ name, text }) => ({ name, text })),
      contextText: s.contextText,
      semiformalText: s.semiformalText,
      leanCode: s.leanCode,
      semiformalDirty: s.semiformalDirty,
      verificationStatus: sanitizeVerificationStatus(s.verificationStatus),
      verificationErrors: s.verificationErrors,
      decomposition: structuredClone(s.decomposition),
      causalGraph: s.getArtifactContent("causal-graph"),
      statisticalModel: s.getArtifactContent("statistical-model"),
      propertyTests: s.getArtifactContent("property-tests"),
      dialecticalMap: s.getArtifactContent("dialectical-map"),
      counterexamples: s.getArtifactContent("counterexamples"),
      customArtifactTypes: structuredClone(s.customArtifactTypes),
      customArtifactData: { ...s.customArtifactData },
    };
  }, []);

  const resetToSnapshot = useCallback((data: PersistedWorkspace): PersistedDecomposition => {
    const store = useWorkspaceStore.getState();
    store.setSourceText(data.sourceText);
    store.setExtractedFiles(data.extractedFiles);
    store.setContextText(data.contextText);
    store.setSemiformalText(data.semiformalText);
    store.setLeanCode(data.leanCode);
    store.setSemiformalDirty(data.semiformalDirty);
    store.setVerificationStatus(data.verificationStatus);
    store.setVerificationErrors(data.verificationErrors);
    store.setDecomposition(data.decomposition);

    // Restore artifact data
    if (data.causalGraph) store.setArtifactGenerated("causal-graph", data.causalGraph);
    if (data.statisticalModel) store.setArtifactGenerated("statistical-model", data.statisticalModel);
    if (data.propertyTests) store.setArtifactGenerated("property-tests", data.propertyTests);
    if (data.dialecticalMap) store.setArtifactGenerated("dialectical-map", data.dialecticalMap);
    if (data.counterexamples) store.setArtifactGenerated("counterexamples", data.counterexamples);

    // Restore custom artifact types + generated data
    store.setCustomArtifactTypes(data.customArtifactTypes ?? []);
    if (data.customArtifactData) {
      for (const [id, content] of Object.entries(data.customArtifactData)) {
        store.setCustomArtifactContent(id as CustomArtifactTypeId, content);
      }
    } else {
      // Clear any stale custom data if the snapshot has none
      for (const id of Object.keys(useWorkspaceStore.getState().customArtifactData)) {
        store.setCustomArtifactContent(id as CustomArtifactTypeId, null);
      }
    }

    return data.decomposition;
  }, []);

  const clearWorkspace = useCallback((): PersistedDecomposition => {
    useWorkspaceStore.getState().clearWorkspace();
    const emptyDecomp: PersistedDecomposition = { nodes: [], selectedNodeId: null, paperText: "", sources: [] };
    return emptyDecomp;
  }, []);

  return useMemo(() => ({
    sourceText,
    setSourceText,
    extractedFiles,
    setExtractedFiles,
    contextText,
    setContextText,
    semiformalText,
    setSemiformalText,
    leanCode,
    setLeanCode,
    semiformalDirty,
    setSemiformalDirty,
    verificationStatus,
    setVerificationStatus,
    verificationErrors,
    setVerificationErrors,
    causalGraph,
    setCausalGraph,
    statisticalModel,
    setStatisticalModel,
    propertyTests,
    setPropertyTests,
    dialecticalMap,
    setDialecticalMap,
    counterexamples,
    setCounterexamples,
    restoredDecompState,
    persistDecompState,
    getSnapshot,
    resetToSnapshot,
    clearWorkspace,
    customArtifactTypes,
    customArtifactData,
    addCustomArtifactType,
    updateCustomArtifactType,
    removeCustomArtifactType,
    setCustomArtifactContent,
  }), [
    sourceText, setSourceText, extractedFiles, setExtractedFiles,
    contextText, setContextText, semiformalText, setSemiformalText,
    leanCode, setLeanCode, semiformalDirty, setSemiformalDirty,
    verificationStatus, setVerificationStatus, verificationErrors, setVerificationErrors,
    causalGraph, setCausalGraph, statisticalModel, setStatisticalModel,
    propertyTests, setPropertyTests, dialecticalMap, setDialecticalMap,
    counterexamples, setCounterexamples,
    restoredDecompState, persistDecompState, getSnapshot, resetToSnapshot, clearWorkspace,
    customArtifactTypes, customArtifactData,
    addCustomArtifactType, updateCustomArtifactType, removeCustomArtifactType, setCustomArtifactContent,
  ]);
}
