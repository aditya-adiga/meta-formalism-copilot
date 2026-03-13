"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import type { SourceDocument } from "@/app/lib/types/decomposition";
import PanelShell from "@/app/components/layout/PanelShell";
import SourcePanel from "@/app/components/panels/SourcePanel";
import ContextPanel from "@/app/components/panels/ContextPanel";
import SemiformalPanel from "@/app/components/panels/SemiformalPanel";
import LeanPanel from "@/app/components/panels/LeanPanel";
import GraphPanel from "@/app/components/panels/GraphPanel";
import NodeDetailPanel from "@/app/components/panels/NodeDetailPanel";
import { useDecomposition } from "@/app/hooks/useDecomposition";
import { useWorkspacePersistence } from "@/app/hooks/useWorkspacePersistence";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import {
  SourceIcon,
  ContextIcon,
  SemiformalIcon,
  LeanIcon,
  GraphIcon,
  NodeDetailIcon,
} from "@/app/components/ui/icons/PanelIcons";

type LoadingPhase = "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying" | "iterating";
type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

const MAX_LEAN_ATTEMPTS = 3;

async function generateLean(informalProof: string, previousAttempt?: string, errors?: string, instruction?: string, contextLeanCode?: string) {
  const res = await fetch("/api/formalization/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ informalProof, previousAttempt, errors, instruction, contextLeanCode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Lean generation failed");
  return data.leanCode as string;
}

async function verifyLean(leanCode: string) {
  const res = await fetch("/api/verification/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leanCode }),
  });
  const data = await res.json();
  return { valid: Boolean(data.valid), errors: (data.errors as string | undefined) ?? "" };
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

  // --- Handlers ---

  const handleSemiformalTextChange = useCallback((text: string) => {
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { semiformalProof: text });
    } else {
      setSemiformalText(text);
      setSemiformalDirty((prev) => prev || leanCode !== "");
    }
  }, [isDecompMode, selectedNode, updateNode, leanCode, setSemiformalText, setSemiformalDirty]);

  const handleLeanCodeChange = useCallback((code: string) => {
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { leanCode: code });
    } else {
      setLeanCode(code);
    }
  }, [isDecompMode, selectedNode, updateNode, setLeanCode]);

  /** Global single-proof: generate semiformal only, then stop for review */
  const handleGenerateSemiformal = useCallback(async () => {
    setLoadingPhase("semiformal");
    setSemiformalText("");
    setLeanCode("");
    setSemiformalDirty(false);
    setVerificationStatus("none");
    setVerificationErrors("");
    setActivePanelId("semiformal");

    try {
      const semiformalRes = await fetch("/api/formalization/semiformal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedPaperText }),
      });
      const semiformalData = await semiformalRes.json();
      if (!semiformalRes.ok) {
        setSemiformalText(`Error: ${semiformalData.error ?? "Unknown error"}`);
        return;
      }
      setSemiformalText(semiformalData.proof as string);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setSemiformalText(`Error: ${msg}`);
    } finally {
      setLoadingPhase("idle");
    }
  }, [combinedPaperText, setSemiformalText, setLeanCode, setSemiformalDirty, setVerificationStatus, setVerificationErrors]);

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

        setLoadingPhase(attempt > 1 ? "reverifying" : "verifying");
        setVerificationStatus("verifying");
        const { valid, errors } = await verifyLean(currentCode);

        if (valid) {
          setVerificationStatus("valid");
          setVerificationErrors("");
          return;
        }

        lastErrors = errors || "Verification failed";
        setVerificationErrors(lastErrors);
        if (attempt === MAX_LEAN_ATTEMPTS) setVerificationStatus("invalid");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      if (!leanCode) setLeanCode(`-- Error: ${msg}`);
      else { setVerificationStatus("invalid"); setVerificationErrors(msg); }
    } finally {
      setLoadingPhase("idle");
    }
  }, [semiformalText, leanCode, setLeanCode, setSemiformalDirty, setVerificationStatus, setVerificationErrors]);

  /** Per-node: generate semiformal only, then stop for review */
  const handleNodeGenerateSemiformal = useCallback(async () => {
    if (!selectedNode) return;

    updateNode(selectedNode.id, { verificationStatus: "in-progress", verificationErrors: "" });
    setLoadingPhase("semiformal");
    setActivePanelId("semiformal");

    try {
      const nodeText = `${selectedNode.statement}\n\n${selectedNode.proofText}`;

      const semiformalRes = await fetch("/api/formalization/semiformal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nodeText }),
      });
      const semiformalData = await semiformalRes.json();
      if (!semiformalRes.ok) {
        updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: semiformalData.error ?? "Unknown error" });
        return;
      }
      updateNode(selectedNode.id, { semiformalProof: semiformalData.proof as string, verificationStatus: "unverified" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [selectedNode, updateNode]);

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

    try {
      let fullCode = code;
      if (isDecompMode && selectedNode) {
        const depContext = gatherDependencyContext(decomp.nodes, selectedNode.id);
        if (depContext) fullCode = `${depContext}\n\n${code}`;
      }
      const { valid, errors } = await verifyLean(fullCode);

      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, {
          verificationStatus: valid ? "verified" : "failed",
          verificationErrors: valid ? "" : errors || "Verification failed",
        });
      } else {
        setVerificationStatus(valid ? "valid" : "invalid");
        setVerificationErrors(valid ? "" : errors || "Verification failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification request failed";
      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: msg });
      } else {
        setVerificationStatus("invalid");
        setVerificationErrors(msg);
      }
    } finally {
      setLoadingPhase("idle");
    }
  }, [isDecompMode, selectedNode, leanCode, decomp.nodes, updateNode, setVerificationStatus, setVerificationErrors]);

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

      const fullCode = depContext ? `${depContext}\n\n${newCode}` : newCode;
      const { valid, errors } = await verifyLean(fullCode);

      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, {
          verificationStatus: valid ? "verified" : "failed",
          verificationErrors: valid ? "" : errors || "Verification failed",
        });
      } else {
        setVerificationStatus(valid ? "valid" : "invalid");
        setVerificationErrors(valid ? "" : errors || "Verification failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Iteration failed";
      if (isDecompMode && selectedNode) {
        updateNode(selectedNode.id, { verificationStatus: "failed", verificationErrors: msg });
      } else {
        setVerificationStatus("invalid");
        setVerificationErrors(msg);
      }
    } finally {
      setLoadingPhase("idle");
    }
  }, [isDecompMode, selectedNode, semiformalText, leanCode, verificationErrors, decomp.nodes, updateNode, setSemiformalDirty, setVerificationStatus, setVerificationErrors, setLeanCode]);

  const handleRegenerateLean = useCallback(() => {
    handleLeanIterate("");
  }, [handleLeanIterate]);

  // Graph panel handlers
  const handleDecompose = useCallback(() => {
    if (sourceDocuments.length > 0) {
      extractPropositions(sourceDocuments);
    }
  }, [sourceDocuments, extractPropositions]);

  const handleSelectNode = useCallback((id: string) => {
    selectNode(id);
    setActivePanelId("node-detail");
  }, [selectNode]);

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
      statusSummary: sourceText || extractedFiles.length > 0
        ? `${extractedFiles.length} file${extractedFiles.length !== 1 ? "s" : ""} uploaded`
        : "No input yet",
    },
    {
      id: "context" as PanelId,
      label: "Context",
      icon: <ContextIcon />,
      statusSummary: contextText ? "Context defined" : "No context",
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
  ], [sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode, loadingPhase, activeVerificationStatus, semiformalReadyForLean, hasDecomp, decomp.nodes, selectedNode]);

  // --- Panel content map ---
  const panelContent: Partial<Record<PanelId, React.ReactNode>> = useMemo(() => ({
    source: (
      <SourcePanel
        sourceText={sourceText}
        onSourceTextChange={setSourceText}
        extractedFiles={extractedFiles}
        onFilesChanged={setExtractedFiles}
      />
    ),
    context: (
      <ContextPanel
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
      />
    ),
    "node-detail": selectedNode ? (
      <NodeDetailPanel
        node={selectedNode}
        dependencies={selectedNodeDeps}
        onFormalise={handleNodeGenerateSemiformal}
        onGenerateLean={handleNodeGenerateLean}
        loading={loadingPhase !== "idle"}
      />
    ) : undefined,
  }), [
    sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode,
    loadingPhase, activeVerificationStatus, activeVerificationErrors,
    semiformalDirty, semiformalReadyForLean, isDecompMode, decomp,
    selectedNode, selectedNodeDeps, sourceDocuments,
    setSourceText, setExtractedFiles, setContextText,
    handleGenerateSemiformal, handleGenerateLean, handleSemiformalTextChange, handleLeanCodeChange,
    handleRegenerateLean, handleReVerify, handleLeanIterate,
    handleSelectNode, handleDecompose, handleNodeGenerateSemiformal, handleNodeGenerateLean,
  ]);

  return (
    <main>
      <PanelShell
        panels={panels}
        activePanelId={activePanelId}
        onSelectPanel={setActivePanelId}
        panelContent={panelContent}
      />
    </main>
  );
}
