"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { PanelId } from "@/app/lib/types/panels";
import type { SourceDocument } from "@/app/lib/types/decomposition";
import PanelShell from "@/app/components/layout/PanelShell";
import InputPanel from "@/app/components/panels/InputPanel";
import SemiformalPanel from "@/app/components/panels/SemiformalPanel";
import LeanPanel from "@/app/components/panels/LeanPanel";
import GraphPanel from "@/app/components/panels/GraphPanel";
import NodeDetailPanel from "@/app/components/panels/NodeDetailPanel";
import AnalyticsPanel from "@/app/components/panels/AnalyticsPanel";
import SessionBanner from "@/app/components/features/session-banner/SessionBanner";
import { useDecomposition } from "@/app/hooks/useDecomposition";
import { useWorkspacePersistence } from "@/app/hooks/useWorkspacePersistence";
import { useAutoFormalizeQueue } from "@/app/hooks/useAutoFormalizeQueue";
import { useFormalizationSessions } from "@/app/hooks/useFormalizationSessions";
import { useFormalizationPipeline } from "@/app/hooks/useFormalizationPipeline";
import { useActiveArtifactState } from "@/app/hooks/useActiveArtifactState";
import { usePanelDefinitions } from "@/app/hooks/usePanelDefinitions";
import { ENDPOINT_PRIORS } from "@/app/lib/llm/predict";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";

export default function Home() {
  // --- Panel navigation ---
  const [activePanelId, setActivePanelId] = useState<PanelId>("source");

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
  } = useWorkspacePersistence();

  // --- Decomposition state ---
  const { state: decomp, selectedNode, extractPropositions, selectNode, updateNode, resetState: resetDecomp } = useDecomposition();
  const isDecompMode = decomp.nodes.length > 0 && selectedNode !== null;

  // --- Auto-formalize queue ---
  const { progress: queueProgress, start: startQueue, pause: pauseQueue, resume: resumeQueue, cancel: cancelQueue } = useAutoFormalizeQueue(decomp.nodes, updateNode);
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
    });
  }, [decomp.nodes, decomp.selectedNodeId, decomp.paperText, persistDecompState]);

  // --- Session state ---
  const {
    activeSession,
    createSession,
    updateSession,
    selectSession,
    sessionsForScope,
  } = useFormalizationSessions();


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
  // Helper: mirror updates to the active session
  const sessionUpdate = useCallback((updates: Record<string, unknown>) => {
    if (activeSession) updateSession(activeSession.id, updates as Partial<Pick<import("@/app/lib/types/session").FormalizationSession, "semiformalText" | "leanCode" | "verificationStatus" | "verificationErrors">>);
  }, [activeSession, updateSession]);

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
    onSessionUpdate: sessionUpdate,
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
      const nodeStatus = status === "valid" ? "verified" as const
        : status === "invalid" ? "failed" as const
        : status === "verifying" ? "in-progress" as const
        : "unverified" as const;
      updateNode(selectedNode.id, { verificationStatus: nodeStatus });
    },
    setVerificationErrors: (errors) => { if (selectedNode) updateNode(selectedNode.id, { verificationErrors: errors }); },
    onResetForLean: () => { if (selectedNode) updateNode(selectedNode.id, { verificationStatus: "in-progress", verificationErrors: "" }); },
    getDependencyContext: () => selectedNode ? gatherDependencyContext(decomp.nodes, selectedNode.id) || undefined : undefined,
    onSessionUpdate: sessionUpdate,
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

  // --- Handlers ---

  const handleSemiformalTextChange = useCallback((text: string) => {
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { semiformalProof: text });
    } else {
      setSemiformalText(text);
      setSemiformalDirty((prev) => prev || leanCode !== "");
    }
    if (activeSession) updateSession(activeSession.id, { semiformalText: text });
  }, [isDecompMode, selectedNode, updateNode, leanCode, setSemiformalText, setSemiformalDirty, activeSession, updateSession]);

  const handleLeanCodeChange = useCallback((code: string) => {
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { leanCode: code });
    } else {
      setLeanCode(code);
    }
    if (activeSession) updateSession(activeSession.id, { leanCode: code });
  }, [isDecompMode, selectedNode, updateNode, setLeanCode, activeSession, updateSession]);

  /** Global: generate semiformal, create session, navigate to panel */
  const handleGenerateSemiformal = useCallback(async () => {
    selectNode(null);
    createSession({ type: "global" });
    setActivePanelId("semiformal");
    await globalPipeline.handleGenerateSemiformal(combinedPaperText);
  }, [combinedPaperText, selectNode, createSession, globalPipeline]);

  /** Global: generate Lean from semiformal, navigate to panel */
  const handleGenerateLean = useCallback(async () => {
    setActivePanelId("lean");
    await globalPipeline.handleGenerateLean();
  }, [globalPipeline]);

  /** Per-node: generate semiformal, create session, navigate to panel */
  const handleNodeGenerateSemiformal = useCallback(async () => {
    if (!selectedNode) return;
    createSession({ type: "node", nodeId: selectedNode.id, nodeLabel: selectedNode.label });
    setActivePanelId("semiformal");
    const nodeText = `${selectedNode.statement}\n\n${selectedNode.proofText}`;
    await nodePipeline.handleGenerateSemiformal(nodeText);
  }, [selectedNode, createSession, nodePipeline]);

  /** Per-node: generate Lean + verify, navigate to panel */
  const handleNodeGenerateLean = useCallback(async () => {
    setActivePanelId("lean");
    await nodePipeline.handleGenerateLean();
  }, [nodePipeline]);

  /** Load a previous session's data into the current view (supports cross-scope navigation) */
  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId);
    const allSessions = sessionsForScope({ type: "global" }).concat(
      decomp.nodes.flatMap((n) => sessionsForScope({ type: "node", nodeId: n.id, nodeLabel: n.label }))
    );
    const target = allSessions.find((s) => s.id === sessionId);
    if (!target) return;

    if (target.scope.type === "node") {
      // Navigate into the target node
      selectNode(target.scope.nodeId);
      const nodeStatus = target.verificationStatus === "valid" ? "verified"
        : target.verificationStatus === "invalid" ? "failed"
        : target.verificationStatus === "verifying" ? "in-progress"
        : "unverified";
      updateNode(target.scope.nodeId, {
        semiformalProof: target.semiformalText,
        leanCode: target.leanCode,
        verificationStatus: nodeStatus,
        verificationErrors: target.verificationErrors,
      });
    } else {
      // Global session — exit decomposition mode
      selectNode(null);
      setSemiformalText(target.semiformalText);
      setLeanCode(target.leanCode);
      setVerificationStatus(target.verificationStatus);
      setVerificationErrors(target.verificationErrors);
      setSemiformalDirty(false);
    }
  }, [selectSession, sessionsForScope, decomp.nodes, selectNode, updateNode, setSemiformalText, setLeanCode, setVerificationStatus, setVerificationErrors, setSemiformalDirty]);

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
  }, [selectNode, decomp.nodes, sessionsForScope, selectSession]);

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
  });

  // --- Export All handler ---
  const hasExportableContent = Boolean(semiformalText.trim() || leanCode.trim() || decomp.nodes.length > 0);

  const handleExportAll = useCallback(async () => {
    // Dynamic import so jszip is only loaded when user clicks Export All
    const { exportAllAsZip } = await import("@/app/lib/utils/exportAll");
    await exportAllAsZip({
      semiformalText,
      leanCode,
      nodes: decomp.nodes,
    });
  }, [semiformalText, leanCode, decomp.nodes]);

  // --- Panel content map ---
  // Collect all sessions for the banner dropdown (global + all node scopes)
  const allSessions = useMemo(() => {
    const global = sessionsForScope({ type: "global" });
    const nodeSessions = decomp.nodes.flatMap((n) =>
      sessionsForScope({ type: "node", nodeId: n.id, nodeLabel: n.label })
    );
    return [...global, ...nodeSessions].sort((a, b) => b.runNumber - a.runNumber || b.updatedAt.localeCompare(a.updatedAt));
  }, [sessionsForScope, decomp.nodes]);

  const panelContent: Partial<Record<PanelId, React.ReactNode>> = useMemo(() => {
  const sessionBannerElement = activeSession ? (
    <SessionBanner
      currentSession={activeSession}
      sessions={allSessions}
      onSelectSession={handleSelectSession}
    />
  ) : null;

  return ({
    source: (
      <InputPanel
        sourceText={sourceText}
        onSourceTextChange={setSourceText}
        extractedFiles={extractedFiles}
        onFilesChanged={setExtractedFiles}
        contextText={contextText}
        onContextTextChange={setContextText}
        onFormalise={handleGenerateSemiformal}
        loading={loadingPhase !== "idle"}
      />
    ),
    semiformal: (
      <SemiformalPanel
        semiformalText={activeSemiformal}
        onSemiformalTextChange={handleSemiformalTextChange}
        sessionBanner={sessionBannerElement}
        onGenerateLean={isDecompMode ? handleNodeGenerateLean : handleGenerateLean}
        showGenerateLean={semiformalReadyForLean}
        leanLoading={loadingPhase === "lean" || loadingPhase === "retrying" || loadingPhase === "verifying" || loadingPhase === "reverifying"}
      />
    ),
    lean: (
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
      />
    ),
    graph: (
      <GraphPanel
        propositions={decomp.nodes}
        selectedNodeId={decomp.selectedNodeId}
        onSelectNode={handleSelectNode}
        hasContent={sourceDocuments.length > 0}
        sourceDocuments={sourceDocuments}
        extractionStatus={decomp.extractionStatus}
        onDecompose={handleDecompose}
        queueProgress={queueProgress}
        onFormalizeAll={startQueue}
        onPauseQueue={pauseQueue}
        onResumeQueue={resumeQueue}
        onCancelQueue={cancelQueue}
      />
    ),
    "node-detail": selectedNode ? (
      <NodeDetailPanel
        node={selectedNode}
        dependencies={selectedNodeDeps}
        onFormalise={handleNodeGenerateSemiformal}
        onGenerateLean={handleNodeGenerateLean}
        loading={loadingPhase !== "idle" || queueRunning}
      />
    ) : undefined,
    analytics: (
      <AnalyticsPanel
        endpointPriors={ENDPOINT_PRIORS}
      />
    ),
  });}, [
    sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode,
    loadingPhase, activeVerificationStatus, activeVerificationErrors,
    semiformalDirty, semiformalReadyForLean, isDecompMode, decomp, queueRunning,
    selectedNode, selectedNodeDeps, sourceDocuments,
    queueProgress, startQueue, pauseQueue, resumeQueue, cancelQueue,
    setSourceText, setExtractedFiles, setContextText,
    handleGenerateSemiformal, handleGenerateLean, handleSemiformalTextChange, handleLeanCodeChange,
    activePipeline,
    handleSelectNode, handleDecompose, handleNodeGenerateSemiformal, handleNodeGenerateLean,
    activeSession, allSessions, handleSelectSession,
  ]);

  return (
    <main>
      <PanelShell
        panels={panels}
        activePanelId={activePanelId}
        onSelectPanel={setActivePanelId}
        panelContent={panelContent}
        onExportAll={handleExportAll}
        exportAllDisabled={!hasExportableContent}
      />
    </main>
  );
}
