import { useMemo } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import type { LoadingPhase, VerificationStatus } from "@/app/hooks/useFormalizationPipeline";
import {
  SourceIcon,
  SemiformalIcon,
  LeanIcon,
  GraphIcon,
  NodeDetailIcon,
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
};

export function usePanelDefinitions(opts: PanelDefsInput): PanelDef[] {
  const {
    sourceText, extractedFiles, contextText,
    activeSemiformal, activeLeanCode, loadingPhase,
    activeVerificationStatus, semiformalReadyForLean,
    nodes, selectedNode,
  } = opts;

  const hasDecomp = nodes.length > 0;

  return useMemo(() => [
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
      id: "decomposition" as PanelId,
      label: "Decomposition",
      icon: <GraphIcon />,
      statusSummary: hasDecomp
        ? `${nodes.filter((n) => n.verificationStatus === "verified").length}/${nodes.length} verified`
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
  ], [sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode,
      loadingPhase, activeVerificationStatus, semiformalReadyForLean, hasDecomp, nodes, selectedNode]);
}
