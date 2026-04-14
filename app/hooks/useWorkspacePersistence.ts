"use client";

/**
 * Bridge hook: wraps the Zustand workspace store to provide the same API
 * that page.tsx and other consumers expect from the old useWorkspacePersistence.
 *
 * This exists to avoid a full page.tsx rewrite during the Zustand migration.
 * Once all consumers are migrated to use the store directly, this can be removed.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useWorkspaceStore } from "@/app/lib/stores/workspaceStore";
import type { PersistedDecomposition, PersistedWorkspace } from "@/app/lib/types/persistence";
import type { ArtifactKey } from "@/app/lib/types/artifactStore";
import type { VerificationStatus } from "@/app/lib/types/session";

export function useWorkspacePersistence() {
  const store = useWorkspaceStore();

  // Hydrate on mount (SSR safety — skipHydration is true in the store)
  useEffect(() => {
    useWorkspaceStore.persist.rehydrate();
  }, []);

  // --- Artifact string getters (read current version content) ---
  const persistedCausalGraph = store.getArtifactContent("causal-graph");
  const persistedStatisticalModel = store.getArtifactContent("statistical-model");
  const persistedPropertyTests = store.getArtifactContent("property-tests");
  const persistedDialecticalMap = store.getArtifactContent("balanced-perspectives");
  const persistedCounterexamples = store.getArtifactContent("counterexamples");

  // --- Artifact string setters (write as new generated version) ---
  const setPersistedCausalGraph = useCallback(
    (v: string) => store.setArtifactGenerated("causal-graph", v),
    [store],
  );
  const setPersistedStatisticalModel = useCallback(
    (v: string) => store.setArtifactGenerated("statistical-model", v),
    [store],
  );
  const setPersistedPropertyTests = useCallback(
    (v: string) => store.setArtifactGenerated("property-tests", v),
    [store],
  );
  const setPersistedDialecticalMap = useCallback(
    (v: string) => store.setArtifactGenerated("balanced-perspectives", v),
    [store],
  );
  const setPersistedCounterexamples = useCallback(
    (v: string) => store.setArtifactGenerated("counterexamples", v),
    [store],
  );

  // --- Decomposition bridge ---
  const restoredDecompState = store.decomposition;

  const persistDecompState = useCallback(
    (d: PersistedDecomposition) => store.setDecomposition(d),
    [store],
  );

  // --- Snapshot / restore ---
  const getSnapshot = useCallback((): PersistedWorkspace => {
    const s = store.getSnapshot();
    return {
      version: 2,
      sourceText: s.sourceText,
      extractedFiles: s.extractedFiles.map(({ name, text }) => ({ name, text })),
      contextText: s.contextText,
      semiformalText: s.semiformalText,
      leanCode: s.leanCode,
      semiformalDirty: s.semiformalDirty,
      verificationStatus: s.verificationStatus === "verifying" ? "none" : s.verificationStatus as "none" | "valid" | "invalid",
      verificationErrors: s.verificationErrors,
      decomposition: {
        nodes: s.decomposition.nodes,
        selectedNodeId: s.decomposition.selectedNodeId,
        paperText: s.decomposition.paperText,
        sources: s.decomposition.sources,
        graphLayout: s.decomposition.graphLayout,
      },
      causalGraph: store.getArtifactContent("causal-graph"),
      statisticalModel: store.getArtifactContent("statistical-model"),
      propertyTests: store.getArtifactContent("property-tests"),
      balancedPerspectives: store.getArtifactContent("balanced-perspectives"),
      counterexamples: store.getArtifactContent("counterexamples"),
    };
  }, [store]);

  const resetToSnapshot = useCallback((data: PersistedWorkspace): PersistedDecomposition => {
    store.setSourceText(data.sourceText);
    store.setExtractedFiles(data.extractedFiles);
    store.setContextText(data.contextText);
    store.setSemiformalText(data.semiformalText);
    store.setLeanCode(data.leanCode);
    store.setSemiformalDirty(data.semiformalDirty);
    store.setVerificationStatus(data.verificationStatus as VerificationStatus);
    store.setVerificationErrors(data.verificationErrors);
    store.setDecomposition(data.decomposition);

    // Restore artifact data
    const artifactFields: Array<[ArtifactKey, string | null]> = [
      ["causal-graph", data.causalGraph],
      ["statistical-model", data.statisticalModel],
      ["property-tests", data.propertyTests],
      ["balanced-perspectives", data.balancedPerspectives],
      ["counterexamples", data.counterexamples],
    ];
    for (const [key, content] of artifactFields) {
      if (content) store.setArtifactGenerated(key, content);
    }

    const emptyDecomp: PersistedDecomposition = {
      nodes: [],
      selectedNodeId: null,
      paperText: "",
      sources: [],
    };
    return data.decomposition ?? emptyDecomp;
  }, [store]);

  const clearWorkspace = useCallback((): PersistedDecomposition => {
    store.clearWorkspace();
    return {
      nodes: [],
      selectedNodeId: null,
      paperText: "",
      sources: [],
    };
  }, [store]);

  return useMemo(() => ({
    sourceText: store.sourceText,
    setSourceText: store.setSourceText,
    extractedFiles: store.extractedFiles,
    setExtractedFiles: store.setExtractedFiles,
    contextText: store.contextText,
    setContextText: store.setContextText,
    semiformalText: store.semiformalText,
    setSemiformalText: store.setSemiformalText,
    leanCode: store.leanCode,
    setLeanCode: store.setLeanCode,
    semiformalDirty: store.semiformalDirty,
    setSemiformalDirty: store.setSemiformalDirty,
    verificationStatus: store.verificationStatus,
    setVerificationStatus: store.setVerificationStatus,
    verificationErrors: store.verificationErrors,
    setVerificationErrors: store.setVerificationErrors,
    causalGraph: persistedCausalGraph,
    setCausalGraph: setPersistedCausalGraph,
    statisticalModel: persistedStatisticalModel,
    setStatisticalModel: setPersistedStatisticalModel,
    propertyTests: persistedPropertyTests,
    setPropertyTests: setPersistedPropertyTests,
    dialecticalMap: persistedDialecticalMap,
    setDialecticalMap: setPersistedDialecticalMap,
    counterexamples: persistedCounterexamples,
    setCounterexamples: setPersistedCounterexamples,
    restoredDecompState,
    persistDecompState,
    getSnapshot,
    resetToSnapshot,
    clearWorkspace,
  }), [
    store,
    persistedCausalGraph, setPersistedCausalGraph,
    persistedStatisticalModel, setPersistedStatisticalModel,
    persistedPropertyTests, setPersistedPropertyTests,
    persistedDialecticalMap, setPersistedDialecticalMap,
    persistedCounterexamples, setPersistedCounterexamples,
    restoredDecompState, persistDecompState,
    getSnapshot, resetToSnapshot, clearWorkspace,
  ]);
}
