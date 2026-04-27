"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { PanelId, SplitOrientation } from "@/app/lib/types/panels";
import type { ArtifactType } from "@/app/lib/types/session";
import type { SourceDocument, NodeArtifact } from "@/app/lib/types/decomposition";
import type { CausalGraphResponse, StatisticalModelResponse, PropertyTestsResponse, DialecticalMapResponse } from "@/app/lib/types/artifacts";
import { toNodeVerificationStatus } from "@/app/lib/types/decomposition";
import type { FormalizationSession } from "@/app/lib/types/session";
import PanelShell from "@/app/components/layout/PanelShell";
import WorkspaceSessionBar from "@/app/components/features/workspace-session/WorkspaceSessionBar";
import InputPanel from "@/app/components/panels/InputPanel";
import SemiformalPanel from "@/app/components/panels/SemiformalPanel";
import LeanPanel from "@/app/components/panels/LeanPanel";
import CausalGraphPanel from "@/app/components/panels/CausalGraphPanel";
import StatisticalModelPanel from "@/app/components/panels/StatisticalModelPanel";
import PropertyTestsPanel from "@/app/components/panels/PropertyTestsPanel";
import DialecticalMapPanel from "@/app/components/panels/DialecticalMapPanel";
import CounterexamplesPanel from "@/app/components/panels/CounterexamplesPanel";
import GraphPanel from "@/app/components/panels/GraphPanel";
import NodeDetailPanel from "@/app/components/panels/NodeDetailPanel";
import AnalyticsPanel from "@/app/components/panels/AnalyticsPanel";
import SessionBanner from "@/app/components/features/session-banner/SessionBanner";
import type { PersistedWorkspace, PersistedDecomposition } from "@/app/lib/types/persistence";
import type { ArtifactKey, ArtifactRecord } from "@/app/lib/types/artifactStore";
import { useDecomposition } from "@/app/hooks/useDecomposition";
import { useWorkspaceStore, makeVersion, resolveArtifactContent, resolveArtifactProvenance, PERSISTED_ARTIFACT_FIELDS, type WorkspaceState, type WorkspaceActions } from "@/app/lib/stores/workspaceStore";
import { buildProvenance, buildInputHash } from "@/app/lib/utils/provenance";
import { sanitizeVerificationStatus } from "@/app/lib/utils/workspacePersistence";
import { useAutoFormalizeQueue } from "@/app/hooks/useAutoFormalizeQueue";
import { useFormalizationSessions } from "@/app/hooks/useFormalizationSessions";
import { useWaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import { useFormalizationPipeline } from "@/app/hooks/useFormalizationPipeline";
import { useActiveArtifactState } from "@/app/hooks/useActiveArtifactState";
import { useActiveStructuredArtifacts } from "@/app/hooks/useActiveStructuredArtifacts";
import { usePanelDefinitions } from "@/app/hooks/usePanelDefinitions";
import { useArtifactGeneration } from "@/app/hooks/useArtifactGeneration";
import { useAnalytics } from "@/app/hooks/useAnalytics";
import { useWorkspaceSessions } from "@/app/hooks/useWorkspaceSessions";
import { useAllArtifactEditing } from "@/app/hooks/useArtifactEditing";
import { useEvidenceStore } from "@/app/lib/stores/evidenceStore";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import type { LoadingPhase } from "@/app/hooks/useFormalizationPipeline";

// Stable selectors for artifact content — read from the state snapshot `s`
// (not `get()`) so Zustand can track dependencies and skip re-renders when
// unrelated state changes.
type StoreState = WorkspaceState & WorkspaceActions;
function artifactSelector(key: ArtifactKey): (s: StoreState) => string | null {
  return (s) => resolveArtifactContent(s.artifacts[key]);
}
const selectCausalGraph = artifactSelector("causal-graph");
const selectStatisticalModel = artifactSelector("statistical-model");
const selectPropertyTests = artifactSelector("property-tests");
const selectDialecticalMap = artifactSelector("balanced-perspectives");
const selectCounterexamples = artifactSelector("counterexamples");

// Provenance selectors — return the inputHash of the current version (or undefined)
function provenanceSelector(key: ArtifactKey): (s: StoreState) => string | undefined {
  return (s) => resolveArtifactProvenance(s.artifacts[key])?.inputHash;
}
const selectCausalGraphProvenance = provenanceSelector("causal-graph");
const selectStatisticalModelProvenance = provenanceSelector("statistical-model");
const selectPropertyTestsProvenance = provenanceSelector("property-tests");
const selectDialecticalMapProvenance = provenanceSelector("balanced-perspectives");
const selectCounterexamplesProvenance = provenanceSelector("counterexamples");

function phaseToEndpoint(phase: LoadingPhase): string | null {
  switch (phase) {
    case "semiformal":
      return "formalization/semiformal";
    case "lean":
    case "retrying":
    case "iterating":
      return "formalization/lean";
    case "verifying":
    case "reverifying":
      return "verification/lean";
    case "idle":
      return null;
  }
}

export default function Home() {
  // --- SSR hydration: trigger Zustand rehydrate once on mount ---
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      useWorkspaceStore.persist.rehydrate();
    }
  }, []);

  // --- Panel navigation ---
  const [activePanelId, setActivePanelIdRaw] = useState<PanelId>("source");
  const [secondaryPanelId, setSecondaryPanelIdRaw] = useState<PanelId | null>(null);
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientation>("horizontal");

  // --- Persisted state from Zustand store ---
  const sourceText = useWorkspaceStore((s) => s.sourceText);
  const extractedFiles = useWorkspaceStore((s) => s.extractedFiles);
  const contextText = useWorkspaceStore((s) => s.contextText);
  const semiformalText = useWorkspaceStore((s) => s.semiformalText);
  const leanCode = useWorkspaceStore((s) => s.leanCode);
  const semiformalDirty = useWorkspaceStore((s) => s.semiformalDirty);
  const verificationStatus = useWorkspaceStore((s) => s.verificationStatus);
  const verificationErrors = useWorkspaceStore((s) => s.verificationErrors);
  // Store setters — Zustand selectors return the same function identity across
  // state changes, so Object.is comparison prevents re-renders for these.
  const setSourceText = useWorkspaceStore((s) => s.setSourceText);
  const setExtractedFiles = useWorkspaceStore((s) => s.setExtractedFiles);
  const setContextText = useWorkspaceStore((s) => s.setContextText);
  const setSemiformalText = useWorkspaceStore((s) => s.setSemiformalText);
  const setLeanCode = useWorkspaceStore((s) => s.setLeanCode);
  const setSemiformalDirty = useWorkspaceStore((s) => s.setSemiformalDirty);
  const setVerificationStatus = useWorkspaceStore((s) => s.setVerificationStatus);
  const setVerificationErrors = useWorkspaceStore((s) => s.setVerificationErrors);

  // Decomposition persistence bridge
  const persistDecompState = useCallback((d: PersistedDecomposition) => {
    useWorkspaceStore.getState().setDecomposition(d);
  }, []);

  // Workspace sessions bridge: convert between WorkspaceState and PersistedWorkspace
  const getWorkspaceSnapshot = useCallback((): PersistedWorkspace => {
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
      dialecticalMap: s.getArtifactContent("balanced-perspectives"),
      counterexamples: s.getArtifactContent("counterexamples"),
    };
  }, []);

  const resetWorkspaceToSnapshot = useCallback((data: PersistedWorkspace): PersistedDecomposition => {
    // Build versioned artifact records from flat PersistedWorkspace strings
    const artifacts: Partial<Record<ArtifactKey, ArtifactRecord>> = {};
    for (const [field, key] of Object.entries(PERSISTED_ARTIFACT_FIELDS)) {
      const content = data[field as keyof PersistedWorkspace] as string | null;
      if (content) {
        artifacts[key] = {
          type: key,
          currentVersionIndex: 0,
          versions: [makeVersion(content, "generated")],
        };
      }
    }

    // Single setState call: one persist write instead of 15
    useWorkspaceStore.setState({
      sourceText: data.sourceText,
      extractedFiles: data.extractedFiles,
      contextText: data.contextText,
      semiformalText: data.semiformalText,
      leanCode: data.leanCode,
      semiformalDirty: data.semiformalDirty,
      verificationStatus: sanitizeVerificationStatus(data.verificationStatus),
      verificationErrors: data.verificationErrors,
      decomposition: data.decomposition,
      artifacts,
    });
    return data.decomposition;
  }, []);

  const clearWorkspace = useCallback((): PersistedDecomposition => {
    useWorkspaceStore.getState().clearWorkspace();
    return { nodes: [], selectedNodeId: null, paperText: "", sources: [] };
  }, []);

  // Artifact content (versioned store → flat JSON strings for display)
  const persistedCausalGraph = useWorkspaceStore(selectCausalGraph);
  const persistedStatisticalModel = useWorkspaceStore(selectStatisticalModel);
  const persistedPropertyTests = useWorkspaceStore(selectPropertyTests);
  const persistedDialecticalMap = useWorkspaceStore(selectDialecticalMap);
  const persistedCounterexamples = useWorkspaceStore(selectCounterexamples);

  // Provenance hashes for current artifact versions
  const causalGraphInputHash = useWorkspaceStore(selectCausalGraphProvenance);
  const statisticalModelInputHash = useWorkspaceStore(selectStatisticalModelProvenance);
  const propertyTestsInputHash = useWorkspaceStore(selectPropertyTestsProvenance);
  const dialecticalMapInputHash = useWorkspaceStore(selectDialecticalMapProvenance);
  const counterexamplesInputHash = useWorkspaceStore(selectCounterexamplesProvenance);
  const semiformalProvenance = useWorkspaceStore((s) => s.semiformalProvenance);
  const setSemiformalProvenance = useWorkspaceStore((s) => s.setSemiformalProvenance);

  // --- Artifact data (persisted as JSON strings, parsed for display) ---
  const causalGraph = useMemo(() => {
    if (!persistedCausalGraph) return null;
    try { return JSON.parse(persistedCausalGraph) as import("@/app/lib/types/artifacts").CausalGraphResponse["causalGraph"]; }
    catch { return null; }
  }, [persistedCausalGraph]);

  const statisticalModel = useMemo(() => {
    if (!persistedStatisticalModel) return null;
    try { return JSON.parse(persistedStatisticalModel) as import("@/app/lib/types/artifacts").StatisticalModelResponse["statisticalModel"]; }
    catch { return null; }
  }, [persistedStatisticalModel]);

  const propertyTests = useMemo(() => {
    if (!persistedPropertyTests) return null;
    try { return JSON.parse(persistedPropertyTests) as import("@/app/lib/types/artifacts").PropertyTestsResponse["propertyTests"]; }
    catch { return null; }
  }, [persistedPropertyTests]);

  const dialecticalMap = useMemo(() => {
    if (!persistedDialecticalMap) return null;
    try { return JSON.parse(persistedDialecticalMap) as import("@/app/lib/types/artifacts").DialecticalMapResponse["dialecticalMap"]; }
    catch { return null; }
  }, [persistedDialecticalMap]);

  const counterexamples = useMemo(() => {
    if (!persistedCounterexamples) return null;
    try { return JSON.parse(persistedCounterexamples) as import("@/app/lib/types/artifacts").CounterexamplesResponse["counterexamples"]; }
    catch { return null; }
  }, [persistedCounterexamples]);

  // --- Artifact editing ---
  // Bridge Zustand store actions to the (string | null) => void interface
  // expected by useAllArtifactEditing. Stable identity: useCallback with no deps.
  const setPersistedCausalGraph = useCallback((v: string | null) => {
    if (v) useWorkspaceStore.getState().setArtifactGenerated("causal-graph", v);
  }, []);
  const setPersistedStatisticalModel = useCallback((v: string | null) => {
    if (v) useWorkspaceStore.getState().setArtifactGenerated("statistical-model", v);
  }, []);
  const setPersistedPropertyTests = useCallback((v: string | null) => {
    if (v) useWorkspaceStore.getState().setArtifactGenerated("property-tests", v);
  }, []);
  const setPersistedDialecticalMap = useCallback((v: string | null) => {
    if (v) useWorkspaceStore.getState().setArtifactGenerated("balanced-perspectives", v);
  }, []);
  const setPersistedCounterexamples = useCallback((v: string | null) => {
    if (v) useWorkspaceStore.getState().setArtifactGenerated("counterexamples", v);
  }, []);

  const artifactEditing = useAllArtifactEditing({
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
  });

  // --- Artifact type selection + parallel generation ---
  const [selectedArtifactTypes, setSelectedArtifactTypes] = useState<ArtifactType[]>([]);
  const { loadingState: artifactLoadingState, streamingJsonPreview, generateArtifacts, isAnyGenerating } = useArtifactGeneration();

  // --- Analytics ---
  const { entries: analyticsEntries, summary: analyticsSummary, clearAnalytics, refresh: refreshAnalytics } = useAnalytics();

  const setActivePanelId = useCallback((id: PanelId) => {
    if (id === "analytics") refreshAnalytics();
    setActivePanelIdRaw(id);
    setSecondaryPanelIdRaw((prev) => prev === id ? null : prev);
  }, [refreshAnalytics]);

  const setSecondaryPanelId = useCallback((id: PanelId) => {
    if (id === activePanelId) return;
    if (id === "analytics") refreshAnalytics();
    setSecondaryPanelIdRaw(id);
  }, [activePanelId, refreshAnalytics]);

  const closeSecondaryPanel = useCallback(() => {
    setSecondaryPanelIdRaw(null);
  }, []);

  const toggleSplitOrientation = useCallback(() => {
    setSplitOrientation((prev) => prev === "horizontal" ? "vertical" : "horizontal");
  }, []);

  // Derive per-type loading booleans from artifactLoadingState
  const causalGraphLoading = artifactLoadingState["causal-graph"] === "generating";
  const statisticalModelLoading = artifactLoadingState["statistical-model"] === "generating";
  const propertyTestsLoading = artifactLoadingState["property-tests"] === "generating";
  const dialecticalMapLoading = artifactLoadingState["balanced-perspectives"] === "generating";
  const counterexamplesLoading = artifactLoadingState["counterexamples"] === "generating";

  // --- Decomposition state ---
  const {
    state: decomp,
    selectedNode,
    extractPropositions,
    selectNode,
    updateNode,
    addGraphNode,
    removeGraphNode,
    renameGraphNode,
    addGraphEdge,
    removeGraphEdge,
    updateGraphLayout,
    resetState: resetDecomp,
    streamingNodes,
  } = useDecomposition();
  const isDecompMode = decomp.nodes.length > 0 && selectedNode !== null;

  // --- Graph editing handlers ---
  const handleAddNode = useCallback(() => {
    const id = addGraphNode({ label: "New Node" });
    selectNode(id);
  }, [addGraphNode, selectNode]);

  const handleDeleteEdges = useCallback(
    (edges: Array<{ source: string; target: string }>) => {
      for (const e of edges) {
        removeGraphEdge(e.source, e.target);
      }
    },
    [removeGraphEdge],
  );

  // --- Auto-formalize queue ---
  const { progress: queueProgress, start: startQueue, pause: pauseQueue, resume: resumeQueue, cancel: cancelQueue, reset: resetQueue } = useAutoFormalizeQueue(decomp.nodes, updateNode, contextText);
  const queueRunning = queueProgress.status === "running" || queueProgress.status === "paused";

  // Restore decomposition from persisted store once on mount (one-time read, no subscription)
  const decompRestoredRef = useRef(false);
  useEffect(() => {
    if (!decompRestoredRef.current) {
      decompRestoredRef.current = true;
      const persisted = useWorkspaceStore.getState().decomposition;
      if (persisted.nodes.length > 0) {
        resetDecomp(persisted);
      }
    }
  }, [resetDecomp]);

  // Rehydrate evidence store from localStorage on mount
  useEffect(() => {
    useEvidenceStore.persist.rehydrate();
  }, []);

  // Keep persistence layer in sync with decomposition changes
  useEffect(() => {
    persistDecompState({
      nodes: decomp.nodes,
      selectedNodeId: decomp.selectedNodeId,
      paperText: decomp.paperText,
      sources: decomp.sources ?? [],
      graphLayout: decomp.graphLayout,
    });
  }, [decomp.nodes, decomp.selectedNodeId, decomp.paperText, decomp.sources, decomp.graphLayout, persistDecompState]);

  // --- Session state ---
  // Restore callback: applies a session's data to global or per-node state
  const handleRestoreSession = useCallback((session: FormalizationSession) => {
    if (session.scope.type === "node") {
      selectNode(session.scope.nodeId);
      updateNode(session.scope.nodeId, {
        semiformalProof: session.semiformalText,
        leanCode: session.leanCode,
        verificationStatus: toNodeVerificationStatus(session.verificationStatus),
        verificationErrors: session.verificationErrors,
      });
    } else {
      selectNode(null);
      setSemiformalText(session.semiformalText);
      setLeanCode(session.leanCode);
      setVerificationStatus(session.verificationStatus);
      setVerificationErrors(session.verificationErrors);
      setSemiformalDirty(false);
    }

    // Restore artifact data from session's artifacts[]
    for (const artifact of session.artifacts) {
      switch (artifact.type) {
        case "causal-graph":
        case "statistical-model":
        case "property-tests":
        case "balanced-perspectives":
        case "counterexamples":
          useWorkspaceStore.getState().setArtifactGenerated(artifact.type, artifact.content);
          break;
      }
    }
  }, [selectNode, updateNode, setSemiformalText, setLeanCode, setVerificationStatus, setVerificationErrors, setSemiformalDirty]);

  const {
    activeSession,
    allSessionsSorted,
    createSession,
    syncToActiveSession,
    updateSessionArtifact,
    selectSession,
    selectAndRestore,
    sessionsForScope,
    getSnapshot: getSessionsSnapshot,
    resetToSnapshot: resetSessionsToSnapshot,
    clearAllSessions,
  } = useFormalizationSessions(handleRestoreSession);


  /** Store artifact results in session and (optionally) node */
  const storeArtifactResults = useCallback((
    results: Partial<Record<ArtifactType, unknown>>,
    nodeId?: string,
    provenance?: import("@/app/lib/utils/provenance").GenerationProvenance,
  ) => {
    for (const [type, value] of Object.entries(results)) {
      if (value == null) continue;
      const artifactType = type as ArtifactType;
      const content = typeof value === "string" ? value : JSON.stringify(value);

      // Store in active session
      updateSessionArtifact(artifactType, content);

      // Store in node artifacts if per-node generation
      if (nodeId) {
        const nodeArtifact: NodeArtifact = {
          type: artifactType,
          content,
          verificationStatus: "unverified",
          verificationErrors: "",
        };
        // Upsert: replace existing artifact of same type, or append
        updateNode(nodeId, {
          artifacts: [
            ...(decomp.nodes.find((n) => n.id === nodeId)?.artifacts.filter((a) => a.type !== artifactType) ?? []),
            nodeArtifact,
          ],
        });
      }
    }

    // Batch-update persisted display state — single set() via store action
    const entries = Object.values(PERSISTED_ARTIFACT_FIELDS)
      .filter((key) => results[key] != null)
      .map((key) => ({
        key,
        content: typeof results[key] === "string" ? results[key] as string : JSON.stringify(results[key]),
      }));
    if (entries.length > 0) {
      useWorkspaceStore.getState().setArtifactsBatchGenerated(entries, provenance);
    }
  }, [updateSessionArtifact, updateNode, decomp.nodes]);

  // --- Workspace sessions (higher-level grouping of inputs + outputs) ---
  const {
    workspaceSessions,
    activeWorkspaceSession,
    createNewSession: createNewWorkspaceSession,
    switchToSession: switchWorkspaceSession,
    renameSession: renameWorkspaceSession,
    deleteSession: deleteWorkspaceSession,
  } = useWorkspaceSessions({
    getWorkspaceSnapshot,
    getSessionsSnapshot,
    resetWorkspaceToSnapshot,
    resetSessionsToSnapshot,
    clearWorkspace,
    clearAllSessions,
    resetDecomp,
    cancelQueue,
    resetQueue,
  });

  // --- Combined paper text for single-proof formalization ---
  const combinedPaperText = useMemo(() => {
    return [sourceText, ...extractedFiles.map((f) => `--- ${f.name} ---\n${f.text}`)].filter(Boolean).join("\n\n");
  }, [sourceText, extractedFiles]);

  // --- Input provenance: hash of current inputs for staleness comparison ---
  const currentInputHash = useMemo(
    () => buildInputHash(combinedPaperText, contextText),
    [combinedPaperText, contextText],
  );

  // Per-artifact staleness: true when the artifact was generated from different inputs
  const causalGraphIsStale = !!(causalGraph && causalGraphInputHash && causalGraphInputHash !== currentInputHash);
  const statisticalModelIsStale = !!(statisticalModel && statisticalModelInputHash && statisticalModelInputHash !== currentInputHash);
  const propertyTestsIsStale = !!(propertyTests && propertyTestsInputHash && propertyTestsInputHash !== currentInputHash);
  const dialecticalMapIsStale = !!(dialecticalMap && dialecticalMapInputHash && dialecticalMapInputHash !== currentInputHash);
  const counterexamplesIsStale = !!(counterexamples && counterexamplesInputHash && counterexamplesInputHash !== currentInputHash);
  const semiformalIsStale = !!(semiformalText && semiformalProvenance && semiformalProvenance.inputHash !== currentInputHash);

  // Extract the PDF File reference for structured parsing (non-persisted; only available
  // when the user uploaded a PDF in this session and it hasn't been cleared)
  const pdfFile = useMemo(() => {
    const pdfFiles = extractedFiles.filter(
      (f) => f.file && f.name.toLowerCase().endsWith(".pdf"),
    );
    // Only use structured parsing when there's exactly one PDF source
    return pdfFiles.length === 1 ? pdfFiles[0].file ?? null : null;
  }, [extractedFiles]);

  // --- Source documents for decomposition (each input as a separate document) ---
  const sourceDocuments: SourceDocument[] = useMemo(() => {
    const docs: SourceDocument[] = [];
    let idx = 0;
    if (sourceText.trim()) {
      docs.push({ sourceId: `doc-${idx}`, sourceLabel: "Text Input", text: sourceText });
      idx++;
    }
    for (const f of extractedFiles) {
      docs.push({ sourceId: `doc-${idx}`, sourceLabel: f.name, text: f.text });
      idx++;
    }
    return docs;
  }, [sourceText, extractedFiles]);

  // --- Formalization pipelines ---
  // Global pipeline uses getState() so async callbacks always read the latest store
  // values, avoiding stale closures during multi-step operations (generate → verify → retry).
  // The node pipeline below closes over `selectedNode` instead, because it needs the
  // node identity captured at callback creation time (updateNode is keyed by node ID).
  const globalPipeline = useFormalizationPipeline({
    getSemiformal: () => useWorkspaceStore.getState().semiformalText,
    setSemiformal: (text) => useWorkspaceStore.getState().setSemiformalText(text),
    getLeanCode: () => useWorkspaceStore.getState().leanCode,
    setLeanCode: (code) => useWorkspaceStore.getState().setLeanCode(code),
    getVerificationErrors: () => useWorkspaceStore.getState().verificationErrors,
    setVerificationStatus: (s) => useWorkspaceStore.getState().setVerificationStatus(s),
    setVerificationErrors: (e) => useWorkspaceStore.getState().setVerificationErrors(e),
    onResetForSemiformal: () => { useWorkspaceStore.getState().setSemiformalDirty(false); },
    onResetForLean: () => { useWorkspaceStore.getState().setSemiformalDirty(false); },
    onSessionUpdate: (updates) => {
      syncToActiveSession(updates);
      if (typeof updates.semiformalText === "string" && updates.semiformalText) {
        updateSessionArtifact("semiformal", updates.semiformalText);
      }
      if (typeof updates.leanCode === "string" && updates.leanCode) {
        updateSessionArtifact("lean", updates.leanCode);
      }
    },
  });

  // Node pipeline: reads/writes selected node state
  const nodePipeline = useFormalizationPipeline({
    getSemiformal: () => selectedNode?.semiformalProof ?? "",
    setSemiformal: (text) => { if (selectedNode) updateNode(selectedNode.id, { semiformalProof: text, verificationStatus: "unverified" }); },
    getLeanCode: () => selectedNode?.leanCode ?? "",
    setLeanCode: (code) => { if (selectedNode) updateNode(selectedNode.id, { leanCode: code }); },
    getVerificationErrors: () => selectedNode?.verificationErrors ?? "",
    setVerificationStatus: (status) => {
      if (!selectedNode) return;
      updateNode(selectedNode.id, { verificationStatus: toNodeVerificationStatus(status) });
    },
    setVerificationErrors: (errors) => { if (selectedNode) updateNode(selectedNode.id, { verificationErrors: errors }); },
    onResetForLean: () => { if (selectedNode) updateNode(selectedNode.id, { verificationStatus: "in-progress", verificationErrors: "" }); },
    getDependencyContext: () => selectedNode ? gatherDependencyContext(decomp.nodes, selectedNode.id) || undefined : undefined,
    onSessionUpdate: (updates) => {
      syncToActiveSession(updates);
      if (typeof updates.semiformalText === "string" && updates.semiformalText) {
        updateSessionArtifact("semiformal", updates.semiformalText);
      }
      if (typeof updates.leanCode === "string" && updates.leanCode) {
        updateSessionArtifact("lean", updates.leanCode);
      }
    },
  });

  // Active pipeline resolves based on decomposition mode
  const activePipeline = isDecompMode ? nodePipeline : globalPipeline;

  // Resolve which artifact state to display
  const {
    activeSemiformal, activeLeanCode,
    activeVerificationStatus, activeVerificationErrors,
    loadingPhase, semiformalReadyForLean,
  } = useActiveArtifactState(
    { semiformalText, leanCode, verificationStatus, verificationErrors },
    selectedNode,
    isDecompMode,
    globalPipeline.loadingPhase,
    nodePipeline.loadingPhase,
  );

  const {
    activeCausalGraph, activeStatisticalModel, activePropertyTests,
    activeDialecticalMap, activeCounterexamples,
  } = useActiveStructuredArtifacts(
    causalGraph, statisticalModel, propertyTests, dialecticalMap, counterexamples,
    selectedNode, isDecompMode,
  );

  // Determine if any RPC is in flight (for workspace session-switch guard)
  const isAnyRpcBusy = loadingPhase !== "idle" || isAnyGenerating || queueRunning;

  // --- Wait time estimates ---
  const inputCharCount = useMemo(() => {
    return [sourceText, ...extractedFiles.map((f) => f.text)].join("").length;
  }, [sourceText, extractedFiles]);
  const pipelineEndpoint = phaseToEndpoint(loadingPhase);
  const waitEstimate = useWaitTimeEstimate(pipelineEndpoint, inputCharCount);
  const causalGraphWaitEstimate = useWaitTimeEstimate(
    causalGraphLoading ? "formalization/causal-graph" : null,
    inputCharCount,
  );

  // --- Handlers ---

  const handleSemiformalTextChange = useCallback((text: string) => {
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { semiformalProof: text });
    } else {
      setSemiformalText(text);
      setSemiformalDirty((prev) => prev || leanCode !== "");
    }
    syncToActiveSession({ semiformalText: text });
  }, [isDecompMode, selectedNode, updateNode, leanCode, setSemiformalText, setSemiformalDirty, syncToActiveSession]);

  const handleLeanCodeChange = useCallback((code: string) => {
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { leanCode: code });
    } else {
      setLeanCode(code);
    }
    syncToActiveSession({ leanCode: code });
  }, [isDecompMode, selectedNode, updateNode, setLeanCode, syncToActiveSession]);

  /** Shared generation logic: fire semiformal + other artifacts in parallel */
  const executeGeneration = useCallback(async (
    text: string,
    context: string,
    artifactTypes: ArtifactType[],
    pipeline: typeof globalPipeline,
    nodeId?: string,
    nodeLabel?: string,
  ) => {
    const request = { sourceText: text, context, nodeId, nodeLabel };
    const provenance = buildProvenance(text, context);

    // Clear persisted data for types being regenerated so streaming previews
    // are visible via mergeStreamingPreview (which prefers finalData over preview)
    for (const type of artifactTypes) {
      if (type !== "semiformal") {
        useWorkspaceStore.getState().setArtifactGenerated(type as ArtifactKey, "");
      }
    }

    // Navigate to the first selected artifact panel
    const firstType = artifactTypes[0];
    if (firstType === "semiformal") setActivePanelId("semiformal");
    else if (firstType) setActivePanelId(firstType as PanelId);

    const nonSemiformalTypes = artifactTypes.filter((t) => t !== "semiformal");
    const hasSemiformal = artifactTypes.includes("semiformal");

    const [, artifactResults] = await Promise.all([
      hasSemiformal
        ? pipeline.handleGenerateSemiformal(text).then(() => {
            setSemiformalProvenance(provenance);
          })
        : Promise.resolve(),
      nonSemiformalTypes.length > 0
        ? generateArtifacts(nonSemiformalTypes, request)
        : Promise.resolve({} as Partial<Record<ArtifactType, unknown>>),
    ]);

    if (artifactResults) {
      storeArtifactResults(artifactResults, nodeId, provenance);
    }
  }, [generateArtifacts, storeArtifactResults, setActivePanelId, setSemiformalProvenance]);

  /** Unified: generate all selected artifact types in parallel */
  const handleGenerate = useCallback(async () => {
    const text = isDecompMode && selectedNode
      ? `${selectedNode.statement}\n\n${selectedNode.proofText}`
      : combinedPaperText;
    if (!text.trim()) return;

    if (!isDecompMode) {
      selectNode(null);
      createSession({ type: "global" });
    } else if (selectedNode) {
      createSession({ type: "node", nodeId: selectedNode.id, nodeLabel: selectedNode.label });
    }

    await executeGeneration(
      text, contextText, selectedArtifactTypes,
      isDecompMode ? nodePipeline : globalPipeline,
      selectedNode?.id, selectedNode?.label,
    );
  }, [
    isDecompMode, selectedNode, combinedPaperText, contextText,
    selectedArtifactTypes, selectNode, createSession,
    globalPipeline, nodePipeline, executeGeneration,
  ]);

  /** Global: generate Lean from semiformal, navigate to panel */
  const handleGenerateLean = useCallback(async () => {
    setActivePanelId("lean");
    await globalPipeline.handleGenerateLean();
  }, [globalPipeline, setActivePanelId]);

  /** Per-node: generate selected artifacts using node-level context + chip selection */
  const handleNodeGenerate = useCallback(async () => {
    if (!selectedNode) return;
    const text = `${selectedNode.statement}\n\n${selectedNode.proofText}`;
    if (!text.trim()) return;

    const nodeContext = selectedNode.context || contextText;
    const nodeTypes = selectedNode.selectedArtifactTypes.length > 0
      ? selectedNode.selectedArtifactTypes
      : selectedArtifactTypes;

    createSession({ type: "node", nodeId: selectedNode.id, nodeLabel: selectedNode.label });

    await executeGeneration(
      text, nodeContext, nodeTypes, nodePipeline,
      selectedNode.id, selectedNode.label,
    );
  }, [selectedNode, contextText, selectedArtifactTypes, createSession, nodePipeline, executeGeneration]);

  /** Per-node: generate Lean + verify, navigate to panel */
  const handleNodeGenerateLean = useCallback(async () => {
    setActivePanelId("lean");
    await nodePipeline.handleGenerateLean();
  }, [nodePipeline, setActivePanelId]);

  // Graph panel handlers
  const handleDecompose = useCallback((options?: { forceLlm?: boolean }) => {
    if (sourceDocuments.length > 0) {
      setActivePanelId("decomposition");
      extractPropositions(sourceDocuments, pdfFile, options);
    }
  }, [sourceDocuments, pdfFile, extractPropositions, setActivePanelId]);

  const handleSelectNode = useCallback((id: string) => {
    selectNode(id);
    setActivePanelId("node-detail");
    // Auto-select the most recent session for this node
    const node = decomp.nodes.find((n) => n.id === id);
    if (node) {
      const nodeSessions = sessionsForScope({ type: "node", nodeId: id, nodeLabel: node.label });
      if (nodeSessions.length > 0) {
        selectSession(nodeSessions[0].id);
      }
    }
  }, [selectNode, decomp.nodes, sessionsForScope, selectSession, setActivePanelId]);

  // Resolve dependencies for NodeDetailPanel
  const selectedNodeDeps = useMemo(() => {
    if (!selectedNode) return [];
    return selectedNode.dependsOn
      .map((depId) => decomp.nodes.find((n) => n.id === depId))
      .filter((n): n is NonNullable<typeof n> => n != null);
  }, [selectedNode, decomp.nodes]);

  // --- Panel definitions ---
  const panels = usePanelDefinitions({
    sourceText, extractedFiles, contextText,
    activeSemiformal, activeLeanCode, loadingPhase,
    activeVerificationStatus, semiformalReadyForLean,
    nodes: decomp.nodes, selectedNode,
    hasCausalGraph: activeCausalGraph !== null,
    causalGraphLoading,
    hasStatisticalModel: activeStatisticalModel !== null,
    statisticalModelLoading,
    hasPropertyTests: activePropertyTests !== null,
    propertyTestsLoading,
    hasDialecticalMap: activeDialecticalMap !== null,
    dialecticalMapLoading,
    hasCounterexamples: activeCounterexamples !== null,
    counterexamplesLoading,
  });

  // --- Export All handler ---
  const hasExportableContent = Boolean(
    semiformalText.trim() || leanCode.trim() || decomp.nodes.length > 0
    || causalGraph || statisticalModel || propertyTests || dialecticalMap || counterexamples
  );

  const handleExportAll = useCallback(async () => {
    // Dynamic import so jszip is only loaded when user clicks Export All
    const { exportAllAsZip } = await import("@/app/lib/utils/exportAll");
    await exportAllAsZip({
      semiformalText,
      leanCode,
      nodes: decomp.nodes,
      causalGraph,
      statisticalModel,
      propertyTests,
      dialecticalMap,
      counterexamples,
    });
  }, [semiformalText, leanCode, decomp.nodes, causalGraph, statisticalModel, propertyTests, dialecticalMap, counterexamples]);

  // --- Panel render function (only creates JSX for the active panel) ---
  const renderPanel = useCallback((panelId: PanelId): React.ReactNode => {
    const sessionBannerElement = activeSession ? (
      <SessionBanner
        currentSession={activeSession}
        sessions={allSessionsSorted}
        onSelectSession={selectAndRestore}
      />
    ) : null;

    switch (panelId) {
      case "source":
        return (
          <InputPanel
            sourceText={sourceText}
            onSourceTextChange={setSourceText}
            onFilesChanged={setExtractedFiles}
            existingFiles={extractedFiles}
            contextText={contextText}
            onContextTextChange={setContextText}
            onFormalise={handleGenerate}
            loading={loadingPhase !== "idle" || isAnyGenerating}
            onDecompose={handleDecompose}
            decomposing={decomp.extractionStatus === "extracting"}
            selectedArtifactTypes={selectedArtifactTypes}
            onArtifactTypesChange={setSelectedArtifactTypes}
            loadingState={artifactLoadingState}
            waitEstimate={waitEstimate}
          />
        );
      case "semiformal":
        return (
          <SemiformalPanel
            semiformalText={activeSemiformal}
            onSemiformalTextChange={handleSemiformalTextChange}
            sessionBanner={sessionBannerElement}
            onGenerateLean={isDecompMode ? handleNodeGenerateLean : handleGenerateLean}
            showGenerateLean={semiformalReadyForLean}
            leanLoading={loadingPhase === "lean" || loadingPhase === "retrying" || loadingPhase === "verifying" || loadingPhase === "reverifying"}
            waitEstimate={waitEstimate}
            isStale={semiformalIsStale}
            onRegenerate={handleGenerate}
          />
        );
      case "lean":
        return (
          <LeanPanel
            leanCode={activeLeanCode}
            onLeanCodeChange={handleLeanCodeChange}
            loadingPhase={loadingPhase}
            verificationStatus={activeVerificationStatus}
            verificationErrors={activeVerificationErrors}
            semiformalDirty={!isDecompMode && semiformalDirty}
            semiformalReady={semiformalReadyForLean}
            onRegenerateLean={activePipeline.handleRegenerateLean}
            onReVerify={activePipeline.handleReVerify}
            onLeanIterate={activePipeline.handleLeanIterate}
            sessionBanner={sessionBannerElement}
            waitEstimate={waitEstimate}
          />
        );
      case "decomposition":
        return (
          <GraphPanel
            propositions={decomp.nodes}
            streamingPropositions={streamingNodes}
            selectedNodeId={decomp.selectedNodeId}
            onSelectNode={handleSelectNode}
            hasContent={sourceDocuments.length > 0}
            sourceDocuments={sourceDocuments}
            extractionStatus={decomp.extractionStatus}
            onDecompose={handleDecompose}
            queueProgress={queueProgress}
            onFormalizeAll={startQueue}
            globalArtifactTypes={selectedArtifactTypes}
            onPauseQueue={pauseQueue}
            onResumeQueue={resumeQueue}
            onCancelQueue={cancelQueue}
            graphLayout={decomp.graphLayout}
            onLayoutChange={updateGraphLayout}
            onAddNode={handleAddNode}
            onDeleteNode={removeGraphNode}
            onRenameNode={renameGraphNode}
            onConnectNodes={addGraphEdge}
            onDeleteEdges={handleDeleteEdges}
          />
        );
      case "node-detail":
        return selectedNode ? (
          <NodeDetailPanel
            node={selectedNode}
            dependencies={selectedNodeDeps}
            onFormalise={handleNodeGenerate}
            onGenerateLean={handleNodeGenerateLean}
            loading={loadingPhase !== "idle" || queueRunning}
            globalContextText={contextText}
            onNodeContextChange={(text) => updateNode(selectedNode.id, { context: text })}
            onNodeArtifactTypesChange={(types) => updateNode(selectedNode.id, { selectedArtifactTypes: types })}
            loadingState={artifactLoadingState}
          />
        ) : undefined;
      case "causal-graph":
        return (
          <CausalGraphPanel
            causalGraph={activeCausalGraph}
            streamingPreview={streamingJsonPreview["causal-graph"] as CausalGraphResponse["causalGraph"] | undefined}
            loading={causalGraphLoading}
            waitEstimate={causalGraphWaitEstimate}
            isStale={causalGraphIsStale}
            onRegenerate={handleGenerate}
          />
        );
      case "statistical-model":
        return (
          <StatisticalModelPanel
            statisticalModel={activeStatisticalModel}
            streamingPreview={streamingJsonPreview["statistical-model"] as StatisticalModelResponse["statisticalModel"] | undefined}
            loading={statisticalModelLoading}
            isStale={statisticalModelIsStale}
            onRegenerate={handleGenerate}
          />
        );
      case "property-tests":
        return (
          <PropertyTestsPanel
            propertyTests={activePropertyTests}
            streamingPreview={streamingJsonPreview["property-tests"] as PropertyTestsResponse["propertyTests"] | undefined}
            loading={propertyTestsLoading}
            isStale={propertyTestsIsStale}
            onRegenerate={handleGenerate}
          />
        );
      case "balanced-perspectives":
        return (
          <DialecticalMapPanel
            dialecticalMap={activeDialecticalMap}
            streamingPreview={streamingJsonPreview["balanced-perspectives"] as DialecticalMapResponse["dialecticalMap"] | undefined}
            loading={dialecticalMapLoading}
            onContentChange={setPersistedDialecticalMap}
            onAiEdit={artifactEditing.dialecticalMap.handleAiEdit}
            editing={artifactEditing.dialecticalMap.editing}
            editWaitEstimate={artifactEditing.dialecticalMap.editWaitEstimate}
            isStale={dialecticalMapIsStale}
            onRegenerate={handleGenerate}
          />
        );
      case "counterexamples":
        return (
          <CounterexamplesPanel
            counterexamples={activeCounterexamples}
            loading={counterexamplesLoading}
            isStale={counterexamplesIsStale}
            onRegenerate={handleGenerate}
          />
        );
      case "analytics":
        return <AnalyticsPanel entries={analyticsEntries} summary={analyticsSummary} onClear={clearAnalytics} />;
      default:
        return undefined;
    }
  }, [
    sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode,
    loadingPhase, activeVerificationStatus, activeVerificationErrors,
    semiformalDirty, semiformalReadyForLean, isDecompMode, decomp, queueRunning,
    selectedNode, selectedNodeDeps, sourceDocuments,
    queueProgress, startQueue, pauseQueue, resumeQueue, cancelQueue,
    setSourceText, setExtractedFiles, setContextText,
    handleGenerate, handleGenerateLean, handleSemiformalTextChange, handleLeanCodeChange,
    activePipeline, isAnyGenerating,
    handleSelectNode, handleDecompose, handleNodeGenerate, handleNodeGenerateLean, updateNode,
    selectedArtifactTypes, artifactLoadingState,
    activeSession, allSessionsSorted, selectAndRestore,
    activeCausalGraph, causalGraphLoading, causalGraphWaitEstimate, streamingJsonPreview,
    activeStatisticalModel, statisticalModelLoading,
    activePropertyTests, propertyTestsLoading,
    activeDialecticalMap, dialecticalMapLoading,
    setPersistedDialecticalMap,
    artifactEditing,
    counterexamplesLoading,
    semiformalIsStale, causalGraphIsStale, statisticalModelIsStale,
    propertyTestsIsStale, dialecticalMapIsStale, counterexamplesIsStale,
    analyticsEntries, analyticsSummary, clearAnalytics,
    waitEstimate,
    streamingNodes, streamingJsonPreview,
    addGraphEdge, handleAddNode, handleDeleteEdges, removeGraphNode, renameGraphNode, updateGraphLayout,
  ]);

  return (
    <main className="flex h-screen flex-col">
      <WorkspaceSessionBar
        sessions={workspaceSessions}
        activeSession={activeWorkspaceSession}
        onNewSession={createNewWorkspaceSession}
        onSwitchSession={switchWorkspaceSession}
        onRenameSession={renameWorkspaceSession}
        onDeleteSession={deleteWorkspaceSession}
        isBusy={isAnyRpcBusy}
      />
      <PanelShell
        panels={panels}
        activePanelId={activePanelId}
        onSelectPanel={setActivePanelId}
        renderPanel={renderPanel}
        onExportAll={handleExportAll}
        exportAllDisabled={!hasExportableContent}
        split={{
          secondaryPanelId,
          onSelectSecondaryPanel: setSecondaryPanelId,
          onCloseSecondary: closeSecondaryPanel,
          orientation: splitOrientation,
          onToggleOrientation: toggleSplitOrientation,
        }}
      />
    </main>
  );
}
