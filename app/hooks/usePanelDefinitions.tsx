import { useMemo } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import type { LoadingPhase, VerificationStatus } from "@/app/lib/types/session";
import {
  SourceIcon,
  SemiformalIcon,
  LeanIcon,
  GraphIcon,
  NodeDetailIcon,
  CausalGraphIcon,
  StatisticalModelIcon,
  PropertyTestsIcon,
  PerspectiveBalanceIcon,
  AnalyticsIcon,
} from "@/app/components/ui/icons/PanelIcons";

type PanelDefsInput = {
  sourceText: string;
  extractedFiles: { name: string }[];
  contextText: string;
  activeSemiformal: string;
  activeLeanCode: string;
  loadingPhase: LoadingPhase;
  activeVerificationStatus: VerificationStatus;
  semiformalReadyForLean: boolean;
  nodes: PropositionNode[];
  selectedNode: PropositionNode | null;
  hasCausalGraph?: boolean;
  causalGraphLoading?: boolean;
  hasStatisticalModel?: boolean;
  statisticalModelLoading?: boolean;
  hasPropertyTests?: boolean;
  propertyTestsLoading?: boolean;
  hasPerspectiveBalance?: boolean;
  perspectiveBalanceLoading?: boolean;
};

export function usePanelDefinitions(opts: PanelDefsInput): PanelDef[] {
  const {
    sourceText, extractedFiles, contextText,
    activeSemiformal, activeLeanCode, loadingPhase,
    activeVerificationStatus, semiformalReadyForLean,
    nodes, selectedNode,
    hasCausalGraph, causalGraphLoading,
    hasStatisticalModel, statisticalModelLoading,
    hasPropertyTests, propertyTestsLoading,
    hasPerspectiveBalance, perspectiveBalanceLoading,
  } = opts;

  const hasDecomp = nodes.length > 0;
  const nodeCount = nodes.length;
  const verifiedCount = nodes.filter((n) => n.verificationStatus === "verified").length;

  return useMemo(() => [
    // --- Navigation group ---
    {
      id: "source" as PanelId,
      label: "Source Input",
      icon: <SourceIcon />,
      group: "navigation" as const,
      statusSummary: [
        sourceText || extractedFiles.length > 0
          ? `${extractedFiles.length} file${extractedFiles.length !== 1 ? "s" : ""} uploaded`
          : "No input yet",
        contextText ? "Context defined" : null,
      ].filter(Boolean).join(" · "),
    },
    {
      id: "decomposition" as PanelId,
      label: "Decomposition",
      icon: <GraphIcon />,
      group: "navigation" as const,
      statusSummary: hasDecomp
        ? `${verifiedCount}/${nodeCount} verified`
        : "No graph",
    },
    {
      id: "node-detail" as PanelId,
      label: "Node Detail",
      icon: <NodeDetailIcon />,
      group: "navigation" as const,
      statusSummary: selectedNode ? selectedNode.label : "",
      hidden: !selectedNode,
    },
    // --- Artifacts group ---
    {
      id: "semiformal" as PanelId,
      label: "Semiformal Proof",
      icon: <SemiformalIcon />,
      group: "artifacts" as const,
      statusSummary: loadingPhase === "semiformal"
        ? "Generating..."
        : semiformalReadyForLean
          ? "Ready for review"
          : activeSemiformal
            ? "Proof ready"
            : "No proof yet",
      hidden: !activeSemiformal && loadingPhase !== "semiformal",
    },
    {
      id: "lean" as PanelId,
      label: "Lean4 Code",
      icon: <LeanIcon />,
      group: "artifacts" as const,
      statusSummary: activeVerificationStatus === "valid"
        ? "Verified"
        : activeVerificationStatus === "invalid"
          ? "Failed"
          : activeLeanCode
            ? "Code ready"
            : "No code yet",
      hidden: !activeLeanCode && loadingPhase !== "lean" && loadingPhase !== "verifying" && loadingPhase !== "retrying" && loadingPhase !== "reverifying" && loadingPhase !== "iterating",
    },
    {
      id: "causal-graph" as PanelId,
      label: "Causal Graph",
      icon: <CausalGraphIcon />,
      group: "artifacts" as const,
      statusSummary: causalGraphLoading ? "Generating..." : hasCausalGraph ? "Graph ready" : "No graph yet",
      hidden: !hasCausalGraph && !causalGraphLoading,
    },
    {
      id: "statistical-model" as PanelId,
      label: "Statistical Model",
      icon: <StatisticalModelIcon />,
      group: "artifacts" as const,
      statusSummary: statisticalModelLoading ? "Generating..." : hasStatisticalModel ? "Model ready" : "No model yet",
      hidden: !hasStatisticalModel && !statisticalModelLoading,
    },
    {
      id: "property-tests" as PanelId,
      label: "Property Tests",
      icon: <PropertyTestsIcon />,
      group: "artifacts" as const,
      statusSummary: propertyTestsLoading ? "Generating..." : hasPropertyTests ? "Tests ready" : "No tests yet",
      hidden: !hasPropertyTests && !propertyTestsLoading,
    },
    {
      id: "perspective-balance" as PanelId,
      label: "Balanced Perspectives",
      icon: <PerspectiveBalanceIcon />,
      group: "artifacts" as const,
      statusSummary: perspectiveBalanceLoading ? "Generating..." : hasPerspectiveBalance ? "Perspectives ready" : "No perspectives yet",
      hidden: !hasPerspectiveBalance && !perspectiveBalanceLoading,
    },
    // --- Meta group ---
    {
      id: "analytics" as PanelId,
      label: "LLM Usage",
      icon: <AnalyticsIcon />,
      group: "meta" as const,
      statusSummary: "Cost estimates",
    },
  ], [sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode,
      loadingPhase, activeVerificationStatus, semiformalReadyForLean, hasDecomp, nodeCount, verifiedCount, selectedNode,
      hasCausalGraph, causalGraphLoading,
      hasStatisticalModel, statisticalModelLoading,
      hasPropertyTests, propertyTestsLoading,
      hasPerspectiveBalance, perspectiveBalanceLoading]);
}
