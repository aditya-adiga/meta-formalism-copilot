"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import type { SessionScope } from "@/app/lib/types/session";
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
import { ENDPOINT_PRIORS } from "@/app/lib/llm/predict";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import {
  SourceIcon,
  SemiformalIcon,
  LeanIcon,
  GraphIcon,
  NodeDetailIcon,
  AnalyticsIcon,
} from "@/app/components/ui/icons/PanelIcons";

type LoadingPhase = "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying" | "iterating";
type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

const MAX_LEAN_ATTEMPTS = 3;

async function verifyLean(leanCode: string) {
  const res = await fetch("/api/verification/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leanCode }),
  });
  const data = await res.json();
  return { valid: Boolean(data.valid), errors: (data.errors as string | undefined) ?? "" };
}

/** Fetch a JSON API route. */
async function fetchApi<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

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

  // --- Ephemeral state (not persisted) ---
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");

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
    activeSessionForScope,
  } = useFormalizationSessions();

  const currentScope: SessionScope = isDecompMode
    ? { type: "node", nodeId: selectedNode!.id, nodeLabel: selectedNode!.label }
    : { type: "global" };
  const currentScopeSessions = sessionsForScope(currentScope);
  const currentScopeActiveSession = activeSessionForScope(currentScope);

  // When in decomposition mode, the semiformal/lean panels show selected node's data
  const activeSemiformal = isDecompMode ? selectedNode!.semiformalProof : semiformalText;
  const activeLeanCode = isDecompMode ? selectedNode!.leanCode : leanCode;
  const activeVerificationStatus: VerificationStatus = isDecompMode
    ? (selectedNode!.verificationStatus === "verified" ? "valid"
      : selectedNode!.verificationStatus === "failed" ? "invalid"
      : selectedNode!.verificationStatus === "in-progress" ? "verifying"
      : "none")
    : verificationStatus;
  const activeVerificationErrors = isDecompMode ? selectedNode!.verificationErrors : verificationErrors;

  // Semiformal exists but Lean hasn't been generated yet — ready for user review
  const semiformalReadyForLean = activeSemiformal !== "" && activeLeanCode === "" && loadingPhase === "idle";

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

  // --- LLM call helpers that record usage ---

  async function generateLean(informalProof: string, previousAttempt?: string, errors?: string, instruction?: string, contextLeanCode?: string) {
    const data = await fetchApi<{ leanCode: string }>(
      "/api/formalization/lean",
      { informalProof, previousAttempt, errors, instruction, contextLeanCode },
    );
    return data.leanCode;
  }

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

  /** Global single-proof: generate semiformal only, then stop for review */
  const handleGenerateSemiformal = useCallback(async () => {
    // Deselect any decomposition node so the global semiformalText drives the panel
    selectNode(null);
    createSession({ type: "global" });
    setLoadingPhase("semiformal");
    setSemiformalText("");
    setLeanCode("");
    setSemiformalDirty(false);
    setVerificationStatus("none");
    setVerificationErrors("");
    setActivePanelId("semiformal");

    try {
      const semiformalData = await fetchApi<{ proof: string }>(
        "/api/formalization/semiformal",
        { text: combinedPaperText },
      );
      setSemiformalText(semiformalData.proof);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setSemiformalText(`Error: ${msg}`);
    } finally {
      setLoadingPhase("idle");
    }
  }, [combinedPaperText, selectNode, createSession, setSemiformalText, setLeanCode, setSemiformalDirty, setVerificationStatus, setVerificationErrors]);

  /** Global single-proof: Lean generation + verification retry loop */
  const handleGenerateLean = useCallback(async () => {
    if (!semiformalText) return;

    setLoadingPhase("lean");
    setLeanCode("");
    setSemiformalDirty(false);
    setVerificationStatus("none");
    setVerificationErrors("");
    setActivePanelId("lean");

    try {
      let currentCode = "";
      let lastErrors = "";

      for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
        if (attempt > 1) setLoadingPhase("retrying");
        currentCode = await generateLean(
          semiformalText,
          attempt > 1 ? currentCode : undefined,
          attempt > 1 ? lastErrors : undefined,
        );
        setLeanCode(currentCode);
        if (activeSession) updateSession(activeSession.id, { leanCode: currentCode });

        setLoadingPhase(attempt > 1 ? "reverifying" : "verifying");
        setVerificationStatus("verifying");
        if (activeSession) updateSession(activeSession.id, { verificationStatus: "verifying" });
        const { valid, errors } = await verifyLean(currentCode);

        if (valid) {
          setVerificationStatus("valid");
          setVerificationErrors("");
          if (activeSession) updateSession(activeSession.id, { verificationStatus: "valid", verificationErrors: "" });
          return;
        }

        lastErrors = errors || "Verification failed";
        setVerificationErrors(lastErrors);
        if (activeSession) updateSession(activeSession.id, { verificationErrors: lastErrors });
        if (attempt === MAX_LEAN_ATTEMPTS) {
          setVerificationStatus("invalid");
          if (activeSession) updateSession(activeSession.id, { verificationStatus: "invalid" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      if (!leanCode) setLeanCode(`-- Error: ${msg}`);
      else { setVerificationStatus("invalid"); setVerificationErrors(msg); }
      if (activeSession) updateSession(activeSession.id, { verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [semiformalText, leanCode, setLeanCode, setSemiformalDirty, setVerificationStatus, setVerificationErrors, activeSession, updateSession]);

  /** Per-node: generate semiformal only, then stop for review */
  const handleNodeGenerateSemiformal = useCallback(async () => {
    if (!selectedNode) return;

    createSession({ type: "node", nodeId: selectedNode.id, nodeLabel: selectedNode.label });
    setLoadingPhase("semiformal");
    setActivePanelId("semiformal");

    try {
      const nodeText = `${selectedNode.statement}\n\n${selectedNode.proofText}`;
      const semiformalData = await fetchApi<{ proof: string }>(
        "/api/formalization/semiformal",
        { text: nodeText },
      );
      updateNode(selectedNode.id, { semiformalProof: semiformalData.proof, verificationStatus: "unverified" });
      if (activeSession) updateSession(activeSession.id, { semiformalText: semiformalData.proof });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [selectedNode, updateNode, createSession, activeSession, updateSession]);

  /** Per-node: Lean generation + verification retry loop */
  const handleNodeGenerateLean = useCallback(async () => {
    if (!selectedNode || !selectedNode.semiformalProof) return;

    updateNode(selectedNode.id, { verificationStatus: "in-progress", verificationErrors: "" });
    setLoadingPhase("lean");
    setActivePanelId("lean");

    try {
      const depContext = gatherDependencyContext(decomp.nodes, selectedNode.id);
      let currentCode = "";
      let lastErrors = "";

      for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
        if (attempt > 1) setLoadingPhase("retrying");
        currentCode = await generateLean(
          selectedNode.semiformalProof,
          attempt > 1 ? currentCode : undefined,
          attempt > 1 ? lastErrors : undefined,
          undefined,
          depContext || undefined,
        );
        updateNode(selectedNode.id, { leanCode: currentCode });

        setLoadingPhase(attempt > 1 ? "reverifying" : "verifying");

        const fullCode = depContext ? `${depContext}\n\n${currentCode}` : currentCode;
        const { valid, errors } = await verifyLean(fullCode);

        if (valid) {
          updateNode(selectedNode.id, { verificationStatus: "verified", verificationErrors: "" });
          return;
        }

        lastErrors = errors || "Verification failed";
        updateNode(selectedNode.id, { verificationErrors: lastErrors });
        if (attempt === MAX_LEAN_ATTEMPTS) {
          updateNode(selectedNode.id, { verificationStatus: "failed" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [selectedNode, decomp.nodes, updateNode]);

  const handleReVerify = useCallback(async () => {
    const code = isDecompMode && selectedNode ? selectedNode.leanCode : leanCode;
    if (!code) return;

    setLoadingPhase("verifying");
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { verificationStatus: "in-progress", verificationErrors: "" });
    } else {
      setVerificationStatus("verifying");
      setVerificationErrors("");
    }
    if (activeSession) updateSession(activeSession.id, { verificationStatus: "verifying", verificationErrors: "" });

    try {
      let fullCode = code;
      if (isDecompMode && selectedNode) {
        const depContext = gatherDependencyContext(decomp.nodes, selectedNode.id);
        if (depContext) fullCode = `${depContext}\n\n${code}`;
      }
      const { valid, errors } = await verifyLean(fullCode);
      const vStatus = valid ? "valid" : "invalid";
      const vErrors = valid ? "" : errors || "Verification failed";

      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, {
          verificationStatus: valid ? "verified" : "failed",
          verificationErrors: vErrors,
        });
      } else {
        setVerificationStatus(vStatus);
        setVerificationErrors(vErrors);
      }
      if (activeSession) updateSession(activeSession.id, { verificationStatus: vStatus, verificationErrors: vErrors });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification request failed";
      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: msg });
      } else {
        setVerificationStatus("invalid");
        setVerificationErrors(msg);
      }
      if (activeSession) updateSession(activeSession.id, { verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [isDecompMode, selectedNode, leanCode, decomp.nodes, updateNode, setVerificationStatus, setVerificationErrors, activeSession, updateSession]);

  const handleLeanIterate = useCallback(async (instruction: string) => {
    const currentSemiformal = isDecompMode && selectedNode ? selectedNode.semiformalProof : semiformalText;
    const currentLean = isDecompMode && selectedNode ? selectedNode.leanCode : leanCode;
    const currentErrors = isDecompMode && selectedNode ? selectedNode.verificationErrors : verificationErrors;

    if (!currentSemiformal) return;

    if (!isDecompMode) setSemiformalDirty(false);
    setLoadingPhase("iterating");

    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { verificationStatus: "in-progress", verificationErrors: "" });
    } else {
      setVerificationStatus("verifying");
      setVerificationErrors("");
    }
    if (activeSession) updateSession(activeSession.id, { verificationStatus: "verifying", verificationErrors: "" });

    try {
      const depContext = isDecompMode && selectedNode
        ? gatherDependencyContext(decomp.nodes, selectedNode.id)
        : undefined;

      const newCode = await generateLean(
        currentSemiformal,
        currentLean || undefined,
        currentErrors || undefined,
        instruction || undefined,
        depContext || undefined,
      );

      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, { leanCode: newCode });
      } else {
        setLeanCode(newCode);
      }
      if (activeSession) updateSession(activeSession.id, { leanCode: newCode });

      const fullCode = depContext ? `${depContext}\n\n${newCode}` : newCode;
      const { valid, errors } = await verifyLean(fullCode);
      const vStatus = valid ? "valid" : "invalid";
      const vErrors = valid ? "" : errors || "Verification failed";

      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, {
          verificationStatus: valid ? "verified" : "failed",
          verificationErrors: vErrors,
        });
      } else {
        setVerificationStatus(vStatus);
        setVerificationErrors(vErrors);
      }
      if (activeSession) updateSession(activeSession.id, { verificationStatus: vStatus, verificationErrors: vErrors });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Iteration failed";
      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: msg });
      } else {
        setVerificationStatus("invalid");
        setVerificationErrors(msg);
      }
      if (activeSession) updateSession(activeSession.id, { verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [isDecompMode, selectedNode, semiformalText, leanCode, verificationErrors, decomp.nodes, updateNode, setSemiformalDirty, setVerificationStatus, setVerificationErrors, setLeanCode, activeSession, updateSession]);

  const handleRegenerateLean = useCallback(() => {
    handleLeanIterate("");
  }, [handleLeanIterate]);

  /** Load a previous session's data into the current view */
  const handleSelectSession = useCallback((sessionId: string) => {
    selectSession(sessionId);
    // Find the session data to load
    const target = currentScopeSessions.find((s) => s.id === sessionId);
    if (!target) return;

    if (isDecompMode && selectedNode) {
      // Map session verification status back to node status
      const nodeStatus = target.verificationStatus === "valid" ? "verified"
        : target.verificationStatus === "invalid" ? "failed"
        : target.verificationStatus === "verifying" ? "in-progress"
        : "unverified";
      updateNode(selectedNode.id, {
        semiformalProof: target.semiformalText,
        leanCode: target.leanCode,
        verificationStatus: nodeStatus,
        verificationErrors: target.verificationErrors,
      });
    } else {
      setSemiformalText(target.semiformalText);
      setLeanCode(target.leanCode);
      setVerificationStatus(target.verificationStatus);
      setVerificationErrors(target.verificationErrors);
      setSemiformalDirty(false);
    }
  }, [selectSession, currentScopeSessions, isDecompMode, selectedNode, updateNode, setSemiformalText, setLeanCode, setVerificationStatus, setVerificationErrors, setSemiformalDirty]);

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
  const hasDecomp = decomp.nodes.length > 0;
  const panels: PanelDef[] = useMemo(() => [
    {
      id: "source" as PanelId,
      label: "Source Input",
      icon: <SourceIcon />,
      statusSummary: [
        sourceText || extractedFiles.length > 0
          ? `${extractedFiles.length} file${extractedFiles.length !== 1 ? "s" : ""} uploaded`
          : "No input yet",
        contextText ? "Context defined" : null,
      ].filter(Boolean).join(" · "),
    },
    {
      id: "graph" as PanelId,
      label: "Proof Graph",
      icon: <GraphIcon />,
      statusSummary: hasDecomp
        ? `${decomp.nodes.filter((n) => n.verificationStatus === "verified").length}/${decomp.nodes.length} verified`
        : "No graph",
    },
    {
      id: "node-detail" as PanelId,
      label: "Node Detail",
      icon: <NodeDetailIcon />,
      statusSummary: selectedNode ? selectedNode.label : "",
      hidden: !selectedNode,
    },
    {
      id: "semiformal" as PanelId,
      label: "Semiformal Proof",
      icon: <SemiformalIcon />,
      statusSummary: loadingPhase === "semiformal"
        ? "Generating..."
        : semiformalReadyForLean
          ? "Ready for review"
          : activeSemiformal
            ? "Proof ready"
            : "No proof yet",
    },
    {
      id: "lean" as PanelId,
      label: "Lean4 Code",
      icon: <LeanIcon />,
      statusSummary: activeVerificationStatus === "valid"
        ? "Verified"
        : activeVerificationStatus === "invalid"
          ? "Failed"
          : activeLeanCode
            ? "Code ready"
            : "No code yet",
    },
    {
      id: "analytics" as PanelId,
      label: "LLM Usage",
      icon: <AnalyticsIcon />,
      statusSummary: "Cost estimates",
    },
  ], [sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode, loadingPhase, activeVerificationStatus, semiformalReadyForLean, hasDecomp, decomp.nodes, selectedNode]);

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
  const panelContent: Partial<Record<PanelId, React.ReactNode>> = useMemo(() => {
  const sessionBannerElement = currentScopeActiveSession ? (
    <SessionBanner
      currentSession={currentScopeActiveSession}
      sessions={currentScopeSessions}
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
        onRegenerateLean={handleRegenerateLean}
        onReVerify={handleReVerify}
        onLeanIterate={handleLeanIterate}
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
    handleRegenerateLean, handleReVerify, handleLeanIterate,
    handleSelectNode, handleDecompose, handleNodeGenerateSemiformal, handleNodeGenerateLean,
    currentScopeActiveSession, currentScopeSessions, handleSelectSession,
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
