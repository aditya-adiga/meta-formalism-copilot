"use client";

import { useState, useCallback } from "react";
import type { DecompositionState, PropositionNode, SourceDocument } from "@/app/lib/types/decomposition";

const INITIAL_STATE: DecompositionState = {
  nodes: [],
  selectedNodeId: null,
  paperText: "",
  sources: [],
  extractionStatus: "idle",
};

export function useDecomposition() {
  const [state, setState] = useState<DecompositionState>(INITIAL_STATE);

  const selectedNode: PropositionNode | null =
    state.nodes.find((n) => n.id === state.selectedNodeId) ?? null;

  const extractPropositions = useCallback(async (documents: SourceDocument[]) => {
    setState((prev) => ({ ...prev, sources: documents, extractionStatus: "extracting", nodes: [], selectedNodeId: null }));
    try {
      const res = await fetch("/api/decomposition/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");

      // Build a lookup from sourceId → sourceLabel for filling in node fields
      const labelMap = new Map(documents.map((d) => [d.sourceId, d.sourceLabel]));

      // API returns partial nodes without client-side fields; fill defaults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodes: PropositionNode[] = data.propositions.map((p: any) => ({
        id: p.id,
        label: p.label,
        kind: p.kind,
        statement: p.statement,
        proofText: p.proofText ?? "",
        dependsOn: p.dependsOn ?? [],
        sourceId: p.sourceId ?? "",
        sourceLabel: p.sourceId ? (labelMap.get(p.sourceId) ?? p.sourceId) : "",
        semiformalProof: "",
        leanCode: "",
        verificationStatus: "unverified" as const,
        verificationErrors: "",
      }));

      setState((prev) => ({ ...prev, nodes, extractionStatus: "done" }));
    } catch (err) {
      console.error("[decomposition]", err);
      setState((prev) => ({ ...prev, extractionStatus: "error" }));
    }
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedNodeId: id }));
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<PropositionNode>) => {
    setState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    }));
  }, []);

  /** Restore persisted decomposition state (called once on mount) */
  const resetState = useCallback(
    (restored: { nodes: PropositionNode[]; selectedNodeId: string | null; paperText: string }) => {
      setState({
        nodes: restored.nodes,
        selectedNodeId: restored.selectedNodeId,
        paperText: restored.paperText,
        sources: [],
        extractionStatus: restored.nodes.length > 0 ? "done" : "idle",
      });
    },
    [],
  );

  return { state, selectedNode, extractPropositions, selectNode, updateNode, resetState };
}
