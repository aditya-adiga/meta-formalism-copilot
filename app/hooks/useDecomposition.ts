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

  const extractPropositions = useCallback(async (documents: SourceDocument[], pdfFile?: File | null) => {
    const combinedText = documents.map((d) => d.text).join("\n\n");
    setState((prev) => ({ ...prev, paperText: combinedText, sources: documents, extractionStatus: "extracting", nodes: [], selectedNodeId: null }));

    // Fast path 1: deterministic LaTeX source parsing (no LLM call)
    try {
      const { isLatexStructured, parseLatexPropositions } = await import("@/app/lib/utils/latexParser");
      if (isLatexStructured(combinedText)) {
        const nodes = parseLatexPropositions(combinedText, documents);
        if (nodes.length > 0) {
          setState((prev) => ({ ...prev, nodes, extractionStatus: "done" }));
          return;
        }
      }
    } catch (err) {
      console.error("[decomposition/latex-parse]", err);
    }

    // Fast path 2: structured PDF parsing for TeX-compiled PDFs (no LLM call)
    if (pdfFile) {
      try {
        const { parsePdfPropositions } = await import("@/app/lib/utils/pdfPropositionParser");
        // Find the source document that corresponds to this PDF file
        const pdfSource = documents.find((d) => d.sourceLabel === pdfFile.name);
        const nodes = await parsePdfPropositions(
          pdfFile,
          pdfSource ? { sourceId: pdfSource.sourceId, sourceLabel: pdfSource.sourceLabel } : undefined,
        );
        if (nodes && nodes.length > 0) {
          setState((prev) => ({ ...prev, nodes, extractionStatus: "done" }));
          return;
        }
      } catch (err) {
        console.error("[decomposition/pdf-parse]", err);
      }
    }

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
    (restored: { nodes: PropositionNode[]; selectedNodeId: string | null; paperText: string; sources?: SourceDocument[] }) => {
      setState({
        nodes: restored.nodes,
        selectedNodeId: restored.selectedNodeId,
        paperText: restored.paperText,
        sources: restored.sources ?? [],
        extractionStatus: restored.nodes.length > 0 ? "done" : "idle",
      });
    },
    [],
  );

  return { state, selectedNode, extractPropositions, selectNode, updateNode, resetState };
}
