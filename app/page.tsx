"use client";

import { useState, useCallback, useMemo } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import type { LlmUsage } from "@/app/lib/types/analytics";
import PanelShell from "@/app/components/layout/PanelShell";
import SourcePanel from "@/app/components/panels/SourcePanel";
import ContextPanel from "@/app/components/panels/ContextPanel";
import SemiformalPanel from "@/app/components/panels/SemiformalPanel";
import LeanPanel from "@/app/components/panels/LeanPanel";
import GraphPanel from "@/app/components/panels/GraphPanel";
import NodeDetailPanel from "@/app/components/panels/NodeDetailPanel";
import AnalyticsPanel from "@/app/components/panels/AnalyticsPanel";
import { useDecomposition } from "@/app/hooks/useDecomposition";
import { useAnalytics } from "@/app/hooks/useAnalytics";
import { gatherDependencyContext } from "@/app/lib/utils/leanContext";
import {
  SourceIcon,
  ContextIcon,
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

/** Fetch a JSON API route and extract _usage if present. */
async function fetchWithUsage<T>(
  url: string,
  body: Record<string, unknown>,
  onUsage?: (usage: LlmUsage) => void,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  if (data._usage && onUsage) onUsage(data._usage);
  return data as T;
}

export default function Home() {
  // --- Panel navigation ---
  const [activePanelId, setActivePanelId] = useState<PanelId>("source");

  // --- Global single-proof state ---
  const [sourceText, setSourceText] = useState("");
  const [extractedFiles, setExtractedFiles] = useState<{ name: string; text: string }[]>([]);
  const [contextText, setContextText] = useState("");
  const [semiformalText, setSemiformalText] = useState("");
  const [leanCode, setLeanCode] = useState("");
  const [semiformalDirty, setSemiformalDirty] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("none");
  const [verificationErrors, setVerificationErrors] = useState("");

  // --- Analytics ---
  const { entries: analyticsEntries, summary: analyticsSummary, recordUsage, clearAnalytics } = useAnalytics();

  // --- Decomposition state ---
  const { state: decomp, selectedNode, extractPropositions, selectNode, updateNode } = useDecomposition();
  const isDecompMode = decomp.nodes.length > 0 && selectedNode !== null;

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

  // --- Combined paper text for decomposition ---
  const combinedPaperText = useMemo(() => {
    return [sourceText, ...extractedFiles.map((f) => `--- ${f.name} ---\n${f.text}`)].filter(Boolean).join("\n\n");
  }, [sourceText, extractedFiles]);

  // --- LLM call helpers that record usage ---

  async function generateLean(informalProof: string, previousAttempt?: string, errors?: string, instruction?: string, contextLeanCode?: string) {
    const data = await fetchWithUsage<{ leanCode: string }>(
      "/api/formalization/lean",
      { informalProof, previousAttempt, errors, instruction, contextLeanCode },
      recordUsage,
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
  }, [isDecompMode, selectedNode, updateNode, leanCode]);

  const handleLeanCodeChange = useCallback((code: string) => {
    if (isDecompMode && selectedNode) {
      updateNode(selectedNode.id, { leanCode: code });
    } else {
      setLeanCode(code);
    }
  }, [isDecompMode, selectedNode, updateNode]);

  /** Global single-proof formalization pipeline */
  const handleFormalise = useCallback(async () => {
    setLoadingPhase("semiformal");
    setSemiformalText("");
    setLeanCode("");
    setSemiformalDirty(false);
    setVerificationStatus("none");
    setVerificationErrors("");
    setActivePanelId("semiformal");

    try {
      const semiformalData = await fetchWithUsage<{ proof: string }>(
        "/api/formalization/semiformal",
        { text: combinedPaperText },
        recordUsage,
      );
      const proof = semiformalData.proof;
      setSemiformalText(proof);

      setLoadingPhase("lean");
      setActivePanelId("lean");
      let currentCode = "";
      let lastErrors = "";

      for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
        if (attempt > 1) setLoadingPhase("retrying");
        currentCode = await generateLean(
          proof,
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
      if (!semiformalText) setSemiformalText(`Error: ${msg}`);
      else if (!leanCode) setLeanCode(`-- Error: ${msg}`);
      else { setVerificationStatus("invalid"); setVerificationErrors(msg); }
    } finally {
      setLoadingPhase("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedPaperText, semiformalText, leanCode, recordUsage]);

  /** Per-node formalization (decomposition mode) */
  const handleNodeFormalise = useCallback(async () => {
    if (!selectedNode) return;

    updateNode(selectedNode.id, { verificationStatus: "in-progress", verificationErrors: "" });
    setLoadingPhase("semiformal");
    setActivePanelId("semiformal");

    try {
      const nodeText = `${selectedNode.statement}\n\n${selectedNode.proofText}`;

      // Step 1: semiformal proof
      const semiformalData = await fetchWithUsage<{ proof: string }>(
        "/api/formalization/semiformal",
        { text: nodeText },
        recordUsage,
      );
      const proof = semiformalData.proof;
      updateNode(selectedNode.id, { semiformalProof: proof });

      // Step 2: Lean generation with dependency context
      setLoadingPhase("lean");
      setActivePanelId("lean");
      const depContext = gatherDependencyContext(decomp.nodes, selectedNode.id);

      let currentCode = "";
      let lastErrors = "";

      for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
        if (attempt > 1) setLoadingPhase("retrying");
        currentCode = await generateLean(
          proof,
          attempt > 1 ? currentCode : undefined,
          attempt > 1 ? lastErrors : undefined,
          undefined,
          depContext || undefined,
        );
        updateNode(selectedNode.id, { leanCode: currentCode });

        setLoadingPhase(attempt > 1 ? "reverifying" : "verifying");

        // Verify with dependency context prepended
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, decomp.nodes, updateNode, recordUsage]);

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
  }, [isDecompMode, selectedNode, leanCode, decomp.nodes, updateNode]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDecompMode, selectedNode, semiformalText, leanCode, verificationErrors, decomp.nodes, updateNode, recordUsage]);

  const handleRegenerateLean = useCallback(() => {
    handleLeanIterate("");
  }, [handleLeanIterate]);

  // Graph panel handlers
  const handleDecompose = useCallback(() => {
    if (combinedPaperText.trim()) {
      extractPropositions(combinedPaperText, recordUsage);
    }
  }, [combinedPaperText, extractPropositions, recordUsage]);

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
      statusSummary: analyticsSummary.totalCalls > 0
        ? `${analyticsSummary.totalCalls} calls`
        : "No calls yet",
    },
  ], [sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode, loadingPhase, activeVerificationStatus, hasDecomp, decomp.nodes, selectedNode, analyticsSummary.totalCalls]);

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
        onFormalise={handleFormalise}
        loading={loadingPhase !== "idle"}
      />
    ),
    semiformal: (
      <SemiformalPanel
        semiformalText={activeSemiformal}
        onSemiformalTextChange={handleSemiformalTextChange}
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
        paperText={combinedPaperText}
        extractionStatus={decomp.extractionStatus}
        onDecompose={handleDecompose}
      />
    ),
    "node-detail": selectedNode ? (
      <NodeDetailPanel
        node={selectedNode}
        dependencies={selectedNodeDeps}
        onFormalise={handleNodeFormalise}
        loading={loadingPhase !== "idle"}
      />
    ) : undefined,
    analytics: (
      <AnalyticsPanel
        entries={analyticsEntries}
        summary={analyticsSummary}
        onClear={clearAnalytics}
      />
    ),
  }), [
    sourceText, contextText, activeSemiformal, activeLeanCode,
    loadingPhase, activeVerificationStatus, activeVerificationErrors,
    semiformalDirty, isDecompMode, decomp,
    selectedNode, selectedNodeDeps, combinedPaperText,
    handleFormalise, handleSemiformalTextChange, handleLeanCodeChange,
    handleRegenerateLean, handleReVerify, handleLeanIterate,
    handleSelectNode, handleDecompose, handleNodeFormalise,
    analyticsEntries, analyticsSummary, clearAnalytics,
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
