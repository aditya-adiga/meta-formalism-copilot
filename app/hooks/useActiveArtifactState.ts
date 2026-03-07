import { useMemo } from "react";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import { fromNodeVerificationStatus } from "@/app/lib/types/decomposition";
import type { LoadingPhase, VerificationStatus } from "@/app/lib/types/session";

type GlobalState = {
  semiformalText: string;
  leanCode: string;
  verificationStatus: VerificationStatus;
  verificationErrors: string;
};

/**
 * Resolves which artifact state to display based on whether a decomposition
 * node is selected (decomp mode) or the global workspace is active.
 */
export function useActiveArtifactState(
  globalState: GlobalState,
  selectedNode: PropositionNode | null,
  isDecompMode: boolean,
  globalLoadingPhase: LoadingPhase,
  nodeLoadingPhase: LoadingPhase,
) {
  return useMemo(() => {
    const loadingPhase = isDecompMode ? nodeLoadingPhase : globalLoadingPhase;

    if (!isDecompMode || !selectedNode) {
      const semiformalReadyForLean =
        globalState.semiformalText !== "" && globalState.leanCode === "" && loadingPhase === "idle";
      return {
        isDecompMode: false as const,
        activeSemiformal: globalState.semiformalText,
        activeLeanCode: globalState.leanCode,
        activeVerificationStatus: globalState.verificationStatus,
        activeVerificationErrors: globalState.verificationErrors,
        loadingPhase,
        semiformalReadyForLean,
      };
    }

    const activeVerificationStatus: VerificationStatus =
      fromNodeVerificationStatus(selectedNode.verificationStatus);

    const semiformalReadyForLean =
      selectedNode.semiformalProof !== "" && selectedNode.leanCode === "" && loadingPhase === "idle";

    return {
      isDecompMode: true as const,
      activeSemiformal: selectedNode.semiformalProof,
      activeLeanCode: selectedNode.leanCode,
      activeVerificationStatus,
      activeVerificationErrors: selectedNode.verificationErrors,
      loadingPhase,
      semiformalReadyForLean,
    };
  }, [globalState, selectedNode, isDecompMode, globalLoadingPhase, nodeLoadingPhase]);
}
