"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { PanelId } from "@/app/lib/types/panels";
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
import { useDecomposition } from "@/app/hooks/useDecomposition";
import { useWorkspacePersistence } from "@/app/hooks/useWorkspacePersistence";
import { useAutoFormalizeQueue } from "@/app/hooks/useAutoFormalizeQueue";
import { useFormalizationSessions } from "@/app/hooks/useFormalizationSessions";
import { useWaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import { useFormalizationPipeline } from "@/app/hooks/useFormalizationPipeline";
import { useActiveArtifactState } from "@/app/hooks/useActiveArtifactState";
import { usePanelDefinitions } from "@/app/hooks/usePanelDefinitions";
import { useArtifactGeneration } from "@/app/hooks/useArtifactGeneration";
import { useAnalytics } from "@/app/hooks/useAnalytics";
import { useWorkspaceSessions } from "@/app/hooks/useWorkspaceSessions";
import { useAllArtifactEditing } from "@/app/hooks/useArtifactEditing";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import type { LoadingPhase } from "@/app/hooks/useFormalizationPipeline";

/** Safely parse a JSON string, returning null on failure */
function parseJson<T>(json: string | null): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; }
  catch { return null; }
}

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
  // --- Panel navigation ---
  const [activePanelId, setActivePanelIdRaw] = useState<PanelId>("source");

  // --- Persisted state (survives page refresh) ---
  const {
    sourceText, setSourceText,
    extractedFiles, setExtractedFiles,
    contextText, setContextText,
    semiformalText, setSemiformalText,
    leanCode, setLeanCode,
    semiformalDirty, setSemiformalDirty,
    verificationStatus, setVerificationStatus,
    verificationErrors, setVerificationErrors,
    restoredDecompState, persistDecompState,
    getSnapshot: getWorkspaceSnapshot, resetToSnapshot: resetWorkspaceToSnapshot, clearWorkspace,
    causalGraph: persistedCausalGraph, setCausalGraph: setPersistedCausalGraph,
    statisticalModel: persistedStatisticalModel, setStatisticalModel: setPersistedStatisticalModel,
    propertyTests: persistedPropertyTests, setPropertyTests: setPersistedPropertyTests,
    dialecticalMap: persistedDialecticalMap, setDialecticalMap: setPersistedDialecticalMap,
    counterexamples: persistedCounterexamples, setCounterexamples: setPersistedCounterexamples,
  } = useWorkspacePersistence();

  // Shared map: artifact type → persisted-state setter (used by restore, store, and clear)
  const artifactSetters = useMemo(() => ({
    "causal-graph": setPersistedCausalGraph,
    "statistical-model": setPersistedStatisticalModel,
    "property-tests": setPersistedPropertyTests,
    "dialectical-map": setPersistedDialecticalMap,
  } as const satisfies Partial<Record<ArtifactType, (v: string) => void>>), [setPersistedCausalGraph, setPersistedStatisticalModel, setPersistedPropertyTests, setPersistedDialecticalMap]);

  // --- Artifact data (persisted as JSON strings, parsed for display) ---
  const causalGraph = useMemo(() => parseJson<import("@/app/lib/types/artifacts").CausalGraphResponse["causalGraph"]>(persistedCausalGraph), [persistedCausalGraph]);
  const statisticalModel = useMemo(() => parseJson<import("@/app/lib/types/artifacts").StatisticalModelResponse["statisticalModel"]>(persistedStatisticalModel), [persistedStatisticalModel]);
  const propertyTests = useMemo(() => parseJson<import("@/app/lib/types/artifacts").PropertyTestsResponse["propertyTests"]>(persistedPropertyTests), [persistedPropertyTests]);
  const dialecticalMap = useMemo(() => parseJson<import("@/app/lib/types/artifacts").DialecticalMapResponse["dialecticalMap"]>(persistedDialecticalMap), [persistedDialecticalMap]);
  const counterexamples = useMemo(() => parseJson<import("@/app/lib/types/artifacts").CounterexamplesResponse["counterexamples"]>(persistedCounterexamples), [persistedCounterexamples]);

  // --- Artifact editing ---
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
  }, [refreshAnalytics]);

  // Derive per-type loading booleans from artifactLoadingState
  const causalGraphLoading = artifactLoadingState["causal-graph"] === "generating";
  const statisticalModelLoading = artifactLoadingState["statistical-model"] === "generating";
  const propertyTestsLoading = artifactLoadingState["property-tests"] === "generating";
  const dialecticalMapLoading = artifactLoadingState["dialectical-map"] === "generating";
  const counterexamplesLoading = artifactLoadingState["counterexamples"] === "generating";

  // --- Decomposition state ---
  const { state: decomp, selectedNode, extractPropositions, selectNode, updateNode, resetState: resetDecomp, streamingNodes } = useDecomposition();
  const isDecompMode = decomp.nodes.length > 0 && selectedNode !== null;

  // --- Auto-formalize queue ---
  const { progress: queueProgress, start: startQueue, pause: pauseQueue, resume: resumeQueue, cancel: cancelQueue } = useAutoFormalizeQueue(decomp.nodes, updateNode, contextText);
  const queueRunning = queueProgress.status === "running" || queueProgress.status === "paused";

  // Restore decomposition from localStorage once on mount
  const decompRestoredRef = useRef(false);
  useEffect(() => {
    if (!decompRestoredRef.current && restoredDecompState) {
      decompRestoredRef.current = true;
      resetDecomp(restoredDecompState);
    }
  }, [restoredDecompState, resetDecomp]);

  // Keep persistence layer in sync with decomposition changes
  useEffect(() => {
    persistDecompState({
      nodes: decomp.nodes,
      selectedNodeId: decomp.selectedNodeId,
      paperText: decomp.paperText,
      sources: decomp.sources ?? [],
    });
  }, [decomp.nodes, decomp.selectedNodeId, decomp.paperText, decomp.sources, persistDecompState]);

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
    const restoreSetters: Partial<Record<ArtifactType, (v: string | null) => void>> = {
      "causal-graph": setPersistedCausalGraph,
      "statistical-model": setPersistedStatisticalModel,
      "property-tests": setPersistedPropertyTests,
      "dialectical-map": setPersistedDialecticalMap,
      counterexamples: setPersistedCounterexamples,
    };
    for (const artifact of session.artifacts) {
      restoreSetters[artifact.type]?.(artifact.content);
    }
  }, [selectNode, updateNode, setSemiformalText, setLeanCode, setVerificationStatus, setVerificationErrors, setSemiformalDirty, artifactSetters, setPersistedCounterexamples]);

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

    // Also update persisted display state (JSON strings)
    const persistSetters: Partial<Record<ArtifactType, (v: string | null) => void>> = {
      "causal-graph": setPersistedCausalGraph,
      "statistical-model": setPersistedStatisticalModel,
      "property-tests": setPersistedPropertyTests,
      "dialectical-map": setPersistedDialecticalMap,
      counterexamples: setPersistedCounterexamples,
    };
    for (const [type, value] of Object.entries(results)) {
      const setter = persistSetters[type as ArtifactType];
      if (setter && value != null) {
        setter(JSON.stringify(value));
      }
    }
  }, [updateSessionArtifact, updateNode, decomp.nodes, artifactSetters, setPersistedCounterexamples]);

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
  });

  // --- Combined paper text for single-proof formalization ---
  const combinedPaperText = useMemo(() => {
    return [sourceText, ...extractedFiles.map((f) => `--- ${f.name} ---\n${f.text}`)].filter(Boolean).join("\n\n");
  }, [sourceText, extractedFiles]);

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
    if (sourceText.trim()) {
      docs.push({ sourceId: "doc-0", sourceLabel: "Text Input", text: sourceText });
    }
    for (const f of extractedFiles) {
      docs.push({ sourceId: `doc-${docs.length}`, sourceLabel: f.name, text: f.text });
    }
    return docs;
  }, [sourceText, extractedFiles]);

  // --- Formalization pipelines ---
  // Global pipeline: reads/writes global persisted state
  const globalPipeline = useFormalizationPipeline({
    getSemiformal: () => semiformalText,
    setSemiformal: setSemiformalText,
    getLeanCode: () => leanCode,
    setLeanCode: setLeanCode,
    getVerificationErrors: () => verificationErrors,
    setVerificationStatus,
    setVerificationErrors,
    onResetForSemiformal: () => { setSemiformalDirty(false); },
    onResetForLean: () => { setSemiformalDirty(false); },
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

    // Clear persisted data for types being regenerated so streaming previews
    // are visible via mergeStreamingPreview (which prefers finalData over preview)
    for (const type of artifactTypes) {
      const setter = artifactSetters[type as keyof typeof artifactSetters];
      if (setter) setter("");
    }

    // Navigate to the first selected artifact panel
    const firstType = artifactTypes[0];
    if (firstType === "semiformal") setActivePanelId("semiformal");
    else if (firstType) setActivePanelId(firstType as PanelId);

    const nonSemiformalTypes = artifactTypes.filter((t) => t !== "semiformal");
    const hasSemiformal = artifactTypes.includes("semiformal");

    const [, artifactResults] = await Promise.all([
      hasSemiformal
        ? pipeline.handleGenerateSemiformal(text)
        : Promise.resolve(),
      nonSemiformalTypes.length > 0
        ? generateArtifacts(nonSemiformalTypes, request)
        : Promise.resolve({} as Partial<Record<ArtifactType, unknown>>),
    ]);

    if (artifactResults) {
      storeArtifactResults(artifactResults, nodeId);
    }
  }, [generateArtifacts, storeArtifactResults, setActivePanelId, artifactSetters]);

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
  const handleDecompose = useCallback(() => {
    if (sourceDocuments.length > 0) {
      extractPropositions(sourceDocuments, pdfFile);
    }
  }, [sourceDocuments, pdfFile, extractPropositions]);

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
    hasCausalGraph: causalGraph !== null,
    causalGraphLoading,
    hasStatisticalModel: statisticalModel !== null,
    statisticalModelLoading,
    hasPropertyTests: propertyTests !== null,
    propertyTestsLoading,
    hasDialecticalMap: dialecticalMap !== null,
    dialecticalMapLoading,
    hasCounterexamples: counterexamples !== null,
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
            causalGraph={causalGraph}
            streamingPreview={streamingJsonPreview["causal-graph"] as CausalGraphResponse["causalGraph"] | undefined}
            loading={causalGraphLoading}
            waitEstimate={causalGraphWaitEstimate}

            onContentChange={setPersistedCausalGraph}
            onAiEdit={artifactEditing.causalGraph.handleAiEdit}
            editing={artifactEditing.causalGraph.editing}
            editWaitEstimate={artifactEditing.causalGraph.editWaitEstimate}
          />
        );
      case "statistical-model":
        return (
          <StatisticalModelPanel
            statisticalModel={statisticalModel}
            streamingPreview={streamingJsonPreview["statistical-model"] as StatisticalModelResponse["statisticalModel"] | undefined}
            loading={statisticalModelLoading}

            onContentChange={setPersistedStatisticalModel}
            onAiEdit={artifactEditing.statisticalModel.handleAiEdit}
            editing={artifactEditing.statisticalModel.editing}
            editWaitEstimate={artifactEditing.statisticalModel.editWaitEstimate}
          />
        );
      case "property-tests":
        return (
          <PropertyTestsPanel
            propertyTests={propertyTests}
            streamingPreview={streamingJsonPreview["property-tests"] as PropertyTestsResponse["propertyTests"] | undefined}
            loading={propertyTestsLoading}

            onContentChange={setPersistedPropertyTests}
            onAiEdit={artifactEditing.propertyTests.handleAiEdit}
            editing={artifactEditing.propertyTests.editing}
            editWaitEstimate={artifactEditing.propertyTests.editWaitEstimate}
          />
        );
      case "dialectical-map":
        return (
          <DialecticalMapPanel
            dialecticalMap={dialecticalMap}
            streamingPreview={streamingJsonPreview["dialectical-map"] as DialecticalMapResponse["dialecticalMap"] | undefined}
            loading={dialecticalMapLoading}

            onContentChange={setPersistedDialecticalMap}
            onAiEdit={artifactEditing.dialecticalMap.handleAiEdit}
            editing={artifactEditing.dialecticalMap.editing}
            editWaitEstimate={artifactEditing.dialecticalMap.editWaitEstimate}
          />
        );
      case "counterexamples":
        return (
          <CounterexamplesPanel
            counterexamples={counterexamples}
            loading={counterexamplesLoading}

            onContentChange={setPersistedCounterexamples}
            onAiEdit={artifactEditing.counterexamples.handleAiEdit}
            editing={artifactEditing.counterexamples.editing}
            editWaitEstimate={artifactEditing.counterexamples.editWaitEstimate}
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
    causalGraph, causalGraphLoading, causalGraphWaitEstimate, streamingJsonPreview,
    setPersistedCausalGraph,
    statisticalModel, statisticalModelLoading,
    setPersistedStatisticalModel,
    propertyTests, propertyTestsLoading,
    setPersistedPropertyTests,
    dialecticalMap, dialecticalMapLoading,
    setPersistedDialecticalMap,
    counterexamples, counterexamplesLoading,
    setPersistedCounterexamples,
    artifactEditing,
    analyticsEntries, analyticsSummary, clearAnalytics,
    waitEstimate,
    streamingNodes,
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
      />
    </main>
  );
}
