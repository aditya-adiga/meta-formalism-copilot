"use client";

import { useState, useCallback } from "react";
import type { DecompositionState, PropositionNode } from "@/app/lib/types/decomposition";

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

  const extractPropositions = useCallback(async (text: string, pdfFile?: File | null) => {
    setState((prev) => ({ ...prev, paperText: text, extractionStatus: "extracting", nodes: [], selectedNodeId: null }));

    // Fast path 1: deterministic LaTeX source parsing (no LLM call)
    try {
      const { isLatexStructured, parseLatexPropositions } = await import("@/app/lib/utils/latexParser");
      if (isLatexStructured(text)) {
        const nodes = parseLatexPropositions(text);
        if (nodes.length > 0) {
          setState((prev) => ({ ...prev, nodes, extractionStatus: "done" }));
          return;
        }
        // Zero nodes → fall through
      }
    } catch (err) {
      console.error("[decomposition/latex-parse]", err);
      // Parse error → fall through
    }

    // Fast path 2: structured PDF parsing for TeX-compiled PDFs (no LLM call)
    if (pdfFile) {
      try {
        const { parsePdfPropositions } = await import("@/app/lib/utils/pdfPropositionParser");
        const nodes = await parsePdfPropositions(pdfFile);
        if (nodes && nodes.length > 0) {
          setState((prev) => ({ ...prev, nodes, extractionStatus: "done" }));
          return;
        }
        // null or empty → fall through to LLM
      } catch (err) {
        console.error("[decomposition/pdf-parse]", err);
        // Parse error → fall through to LLM
      }
    }

    try {
      const res = await fetch("/api/decomposition/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");

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

  /** Restore persisted decomposition state (called once on mount) */
  const resetState = useCallback(
    (restored: { nodes: PropositionNode[]; selectedNodeId: string | null; paperText: string }) => {
      setState({
        nodes: restored.nodes,
        selectedNodeId: restored.selectedNodeId,
        paperText: restored.paperText,
        extractionStatus: restored.nodes.length > 0 ? "done" : "idle",
      });
    },
    [],
  );

  return { state, selectedNode, extractPropositions, selectNode, updateNode, resetState };
}
