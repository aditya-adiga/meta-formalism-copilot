import { useMemo } from "react";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import type { ArtifactKey } from "@/app/lib/types/artifactStore";
import type {
  CausalGraphResponse,
  StatisticalModelResponse,
  PropertyTestsResponse,
  DialecticalMapResponse,
  CounterexamplesResponse,
} from "@/app/lib/types/artifacts";

export type ActiveStructuredArtifacts = {
  activeCausalGraph: CausalGraphResponse["causalGraph"] | null;
  activeStatisticalModel: StatisticalModelResponse["statisticalModel"] | null;
  activePropertyTests: PropertyTestsResponse["propertyTests"] | null;
  activeDialecticalMap: DialecticalMapResponse["dialecticalMap"] | null;
  activeCounterexamples: CounterexamplesResponse["counterexamples"] | null;
};

function findNodeArtifact<T>(node: PropositionNode, type: ArtifactKey): T | null {
  const a = node.artifacts.find((art) => art.type === type);
  if (!a) return null;
  try { return JSON.parse(a.content) as T; } catch { return null; }
}

/**
 * Resolves which structured artifact data to display based on whether a
 * decomposition node is selected (decomp mode) or the global workspace is active.
 * Companion to useActiveArtifactState which handles semiformal/lean.
 */
export function useActiveStructuredArtifacts(
  causalGraph: ActiveStructuredArtifacts["activeCausalGraph"],
  statisticalModel: ActiveStructuredArtifacts["activeStatisticalModel"],
  propertyTests: ActiveStructuredArtifacts["activePropertyTests"],
  dialecticalMap: ActiveStructuredArtifacts["activeDialecticalMap"],
  counterexamples: ActiveStructuredArtifacts["activeCounterexamples"],
  selectedNode: PropositionNode | null,
  isDecompMode: boolean,
): ActiveStructuredArtifacts {
  return useMemo(() => {
    if (!isDecompMode || !selectedNode) {
      return {
        activeCausalGraph: causalGraph,
        activeStatisticalModel: statisticalModel,
        activePropertyTests: propertyTests,
        activeDialecticalMap: dialecticalMap,
        activeCounterexamples: counterexamples,
      };
    }
    return {
      activeCausalGraph: findNodeArtifact(selectedNode, "causal-graph"),
      activeStatisticalModel: findNodeArtifact(selectedNode, "statistical-model"),
      activePropertyTests: findNodeArtifact(selectedNode, "property-tests"),
      activeDialecticalMap: findNodeArtifact(selectedNode, "balanced-perspectives"),
      activeCounterexamples: findNodeArtifact(selectedNode, "counterexamples"),
    };
  }, [isDecompMode, selectedNode, causalGraph, statisticalModel, propertyTests, dialecticalMap, counterexamples]);
}
