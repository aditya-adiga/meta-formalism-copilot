"use client";

import { useState, useCallback } from "react";
import type { DecompositionState, PropositionNode } from "@/app/lib/types/decomposition";
import type { LlmUsage } from "@/app/lib/types/analytics";

const INITIAL_STATE: DecompositionState = {
  nodes: [],
  selectedNodeId: null,
  paperText: "",
  extractionStatus: "idle",
};

export function useDecomposition() {
  const [state, setState] = useState<DecompositionState>(INITIAL_STATE);

  const selectedNode: PropositionNode | null =
    state.nodes.find((n) => n.id === state.selectedNodeId) ?? null;

  const extractPropositions = useCallback(async (text: string, onUsage?: (usage: LlmUsage) => void) => {
    setState((prev) => ({ ...prev, paperText: text, extractionStatus: "extracting", nodes: [], selectedNodeId: null }));
    try {
      const res = await fetch("/api/decomposition/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      if (data._usage && onUsage) onUsage(data._usage);

      // API returns partial nodes without client-side fields; fill defaults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodes: PropositionNode[] = data.propositions.map((p: any) => ({
        id: p.id,
        label: p.label,
        kind: p.kind,
        statement: p.statement,
        proofText: p.proofText ?? "",
        dependsOn: p.dependsOn ?? [],
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

  return { state, selectedNode, extractPropositions, selectNode, updateNode };
}
