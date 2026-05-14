import { useMemo } from "react";
import type { PanelDef, PanelId } from "@/app/lib/types/panels";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import type { LoadingPhase, VerificationStatus } from "@/app/lib/types/session";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";
import type { ArtifactLoadingState } from "@/app/hooks/useArtifactGeneration";

/** Stable string key representing which custom types are currently loading */
function deriveCustomLoadingKey(
  customTypes: CustomArtifactTypeDefinition[],
  loadingState: ArtifactLoadingState,
): string {
  return customTypes.map((ct) => loadingState[ct.id] === "generating" ? "1" : "0").join("");
}
import {
  SourceIcon,
  SemiformalIcon,
  LeanIcon,
  GraphIcon,
  NodeDetailIcon,
  CausalGraphIcon,
  StatisticalModelIcon,
  PropertyTestsIcon,
  DialecticalMapIcon,
  AnalyticsIcon,
  CounterexamplesIcon,
  CustomArtifactIcon,
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
  hasDialecticalMap?: boolean;
  dialecticalMapLoading?: boolean;
  hasCounterexamples?: boolean;
  counterexamplesLoading?: boolean;
  /** Custom artifact type definitions for dynamic panel entries */
  customArtifactTypes?: CustomArtifactTypeDefinition[];
  /** Which custom types have data */
  customArtifactData?: Record<string, string | null>;
  artifactLoadingState?: ArtifactLoadingState;
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
    hasDialecticalMap, dialecticalMapLoading,
    hasCounterexamples, counterexamplesLoading,
    customArtifactTypes = [],
    customArtifactData = {},
    artifactLoadingState = {},
  } = opts;

  const hasDecomp = nodes.length > 0;
  const nodeCount = nodes.length;
  const verifiedCount = nodes.filter((n) => n.verificationStatus === "verified").length;

  // Derive a stable key so the memo only invalidates when custom types' loading states actually change
  const customLoadingKey = deriveCustomLoadingKey(customArtifactTypes, artifactLoadingState);

  return useMemo(() => {
    const builtinPanels: PanelDef[] = [
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
        label: "Breakdown",
        icon: <GraphIcon />,
        group: "navigation" as const,
        statusSummary: hasDecomp
          ? `${verifiedCount}/${nodeCount} checked`
          : "Not started",
      },
      {
        id: "node-detail" as PanelId,
        label: "Component Detail",
        icon: <NodeDetailIcon />,
        group: "navigation" as const,
        statusSummary: selectedNode ? selectedNode.label : "",
        hidden: !selectedNode,
      },
      // --- Artifacts group ---
      {
        id: "semiformal" as PanelId,
        label: "Step-by-Step Proof",
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
        label: "Proof Code",
        icon: <LeanIcon />,
        group: "artifacts" as const,
        statusSummary: activeVerificationStatus === "valid"
          ? "Passed"
          : activeVerificationStatus === "invalid"
            ? "Failed"
            : activeLeanCode
              ? "Code ready"
              : "No code yet",
        hidden: !activeLeanCode && loadingPhase !== "lean" && loadingPhase !== "verifying" && loadingPhase !== "retrying" && loadingPhase !== "reverifying" && loadingPhase !== "iterating",
      },
      {
        id: "causal-graph" as PanelId,
        label: "Cause & Effect Map",
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
        label: "Consistency Checks",
        icon: <PropertyTestsIcon />,
        group: "artifacts" as const,
        statusSummary: propertyTestsLoading ? "Generating..." : hasPropertyTests ? "Tests ready" : "No tests yet",
        hidden: !hasPropertyTests && !propertyTestsLoading,
      },
      {
        id: "balanced-perspectives" as PanelId,
        label: "Balanced Perspectives",
        icon: <DialecticalMapIcon />,
        group: "artifacts" as const,
        statusSummary: dialecticalMapLoading ? "Generating..." : hasDialecticalMap ? "Map ready" : "No map yet",
        hidden: !hasDialecticalMap && !dialecticalMapLoading,
      },
      {
        id: "counterexamples" as PanelId,
        label: "Counterexamples",
        icon: <CounterexamplesIcon />,
        group: "artifacts" as const,
        statusSummary: counterexamplesLoading ? "Generating..." : hasCounterexamples ? "Counterexamples ready" : "No counterexamples yet",
        hidden: !hasCounterexamples && !counterexamplesLoading,
      },
    ];

    // Dynamic custom type panels
    const customPanels: PanelDef[] = customArtifactTypes.map((ct) => {
      const hasData = !!customArtifactData[ct.id];
      const isLoading = artifactLoadingState[ct.id] === "generating";
      return {
        id: ct.id as PanelId,
        label: ct.name,
        icon: <CustomArtifactIcon />,
        group: "artifacts" as const,
        statusSummary: isLoading ? "Generating..." : hasData ? "Ready" : `No ${ct.name.toLowerCase()} yet`,
        hidden: !hasData && !isLoading,
      };
    });

    // --- Meta group ---
    const metaPanels: PanelDef[] = [
      {
        id: "analytics" as PanelId,
        label: "AI Usage",
        icon: <AnalyticsIcon />,
        group: "meta" as const,
        statusSummary: "Cost estimates",
      },
    ];

    return [...builtinPanels, ...customPanels, ...metaPanels];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- artifactLoadingState intentionally replaced by stable customLoadingKey
  }, [sourceText, extractedFiles, contextText, activeSemiformal, activeLeanCode,
      loadingPhase, activeVerificationStatus, semiformalReadyForLean, hasDecomp, nodeCount, verifiedCount, selectedNode,
      hasCausalGraph, causalGraphLoading,
      hasStatisticalModel, statisticalModelLoading,
      hasPropertyTests, propertyTestsLoading,
      hasDialecticalMap, dialecticalMapLoading,
      hasCounterexamples, counterexamplesLoading,
      customArtifactTypes, customArtifactData, customLoadingKey]);
}
