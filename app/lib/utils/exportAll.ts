/**
 * Zip bundling for "Export All". Separated for code-splitting since
 * jszip is only loaded when the user clicks Export All.
 */

import JSZip from "jszip";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import type { CausalGraphResponse, StatisticalModelResponse, PropertyTestsResponse, PerspectiveBalanceResponse } from "@/app/lib/types/artifacts";
import { sanitizeFilename, triggerDownload } from "./export";
import { getGraphViewportElement, graphToPngBlob } from "./exportGraph";

type ExportAllOptions = {
  semiformalText: string;
  leanCode: string;
  nodes: PropositionNode[];
  causalGraph?: CausalGraphResponse["causalGraph"] | null;
  statisticalModel?: StatisticalModelResponse["statisticalModel"] | null;
  propertyTests?: PropertyTestsResponse["propertyTests"] | null;
  perspectiveBalance?: PerspectiveBalanceResponse["perspectiveBalance"] | null;
};

export async function exportAllAsZip({
  semiformalText,
  leanCode,
  nodes,
  causalGraph,
  statisticalModel,
  propertyTests,
  perspectiveBalance,
}: ExportAllOptions) {
  const zip = new JSZip();

  // Global artifacts
  if (semiformalText.trim()) {
    zip.file("semiformal-proof.md", semiformalText);
  }
  if (leanCode.trim()) {
    zip.file("proof.lean", leanCode);
  }

  // New formalism artifacts
  if (causalGraph) {
    zip.file("causal-graph.json", JSON.stringify(causalGraph, null, 2));
  }
  if (statisticalModel) {
    zip.file("statistical-model.json", JSON.stringify(statisticalModel, null, 2));
  }
  if (propertyTests) {
    zip.file("property-tests.json", JSON.stringify(propertyTests, null, 2));
  }
  if (perspectiveBalance) {
    zip.file("perspective-balance.json", JSON.stringify(perspectiveBalance, null, 2));
  }

  // Graph screenshot (best-effort)
  try {
    const viewport = getGraphViewportElement();
    if (viewport) {
      const pngBlob = await graphToPngBlob(viewport);
      zip.file("proof-graph.png", pngBlob);
    }
  } catch (err) {
    console.warn("[export] Could not capture graph image:", err);
  }

  // Per-node artifacts (decomposition mode)
  if (nodes.length > 0) {
    const nodesFolder = zip.folder("nodes");
    if (nodesFolder) {
      nodes.forEach((node, idx) => {
        const folderName = `${idx}-${sanitizeFilename(node.label)}`;
        const nodeFolder = nodesFolder.folder(folderName);
        if (!nodeFolder) return;
        if (node.semiformalProof.trim()) {
          nodeFolder.file("semiformal.md", node.semiformalProof);
        }
        if (node.leanCode.trim()) {
          nodeFolder.file("proof.lean", node.leanCode);
        }
      });
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, "metaformalism-export.zip");
}
