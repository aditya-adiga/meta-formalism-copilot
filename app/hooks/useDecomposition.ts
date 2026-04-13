"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import type { DecompositionState, PropositionNode, SourceDocument, GraphLayout } from "@/app/lib/types/decomposition";
import type { NewNodeInput } from "@/app/lib/utils/graphOperations";
import {
  addNode as addNodeOp,
  removeNode as removeNodeOp,
  renameNode as renameNodeOp,
  updateNodeStatement as updateNodeStatementOp,
  addEdge as addEdgeOp,
  removeEdge as removeEdgeOp,
} from "@/app/lib/utils/graphOperations";
import { fetchStreamingApi } from "@/app/lib/formalization/api";
import { parse as parsePartialJson } from "partial-json";
import { stripCodeFences, stripLeadingCodeFence } from "@/app/lib/utils/stripCodeFences";
import { throttle } from "@/app/lib/utils/throttle";

const INITIAL_STATE: DecompositionState = {
  nodes: [],
  selectedNodeId: null,
  paperText: "",
  sources: [],
  extractionStatus: "idle",
  graphLayout: undefined,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPropositionNodes(raw: any[], labelMap: Map<string, string>): PropositionNode[] {
  return raw
    // Filter out incomplete items from partial-JSON parsing — nodes without
    // a valid id cause duplicate React keys and dagre layout errors.
    .filter((p) => typeof p === "object" && p !== null && typeof p.id === "string" && p.id !== "")
    .map((p) => ({
      id: p.id,
      label: p.label ?? "",
      kind: p.kind ?? "claim",
      statement: p.statement ?? "",
      proofText: p.proofText ?? "",
      // Guard against partial-json returning a non-array value (e.g. partial
      // string) for dependsOn — iterating a string would yield characters.
      dependsOn: Array.isArray(p.dependsOn) ? p.dependsOn : [],
      sourceId: p.sourceId ?? "",
      sourceLabel: p.sourceId ? (labelMap.get(p.sourceId) ?? p.sourceId) : "",
      semiformalProof: "",
      leanCode: "",
      verificationStatus: "unverified" as const,
      verificationErrors: "",
      context: "",
      selectedArtifactTypes: [],
      artifacts: [],
    }));
}

export function useDecomposition() {
  const [state, setState] = useState<DecompositionState>(INITIAL_STATE);
  // Ref tracks latest nodes so addGraphEdge can read fresh state synchronously
  // without depending on state.nodes in its useCallback deps (which caused stale closures).
  const nodesRef = useRef(state.nodes);
  nodesRef.current = state.nodes;
  const [streamingNodes, setStreamingNodes] = useState<PropositionNode[] | null>(null);

  const selectedNode = useMemo<PropositionNode | null>(
    () => state.nodes.find((n) => n.id === state.selectedNodeId) ?? null,
    [state.nodes, state.selectedNodeId],
  );

  const extractPropositions = useCallback(async (documents: SourceDocument[], pdfFile?: File | null) => {
    const combinedText = documents.map((d) => d.text).join("\n\n");
    setState((prev) => ({ ...prev, paperText: combinedText, sources: documents, extractionStatus: "extracting", nodes: [], selectedNodeId: null }));
    setStreamingNodes(null);

    // Fast path 1: deterministic LaTeX source parsing (no LLM call)
    try {
      const { isLatexStructured, parseLatexPropositions } = await import("@/app/lib/utils/latexParser");
      if (isLatexStructured(combinedText)) {
        const nodes = parseLatexPropositions(combinedText, documents);
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
        // null or empty → fall through to LLM
      } catch (err) {
        console.error("[decomposition/pdf-parse]", err);
        // Parse error → fall through to LLM
      }
    }

    // LLM path: stream with partial-JSON rendering
    const labelMap = new Map(documents.map((d) => [d.sourceId, d.sourceLabel]));

    try {
      const onToken = throttle((accumulated: string) => {
        try {
          const partial = parsePartialJson(stripLeadingCodeFence(accumulated));
          // Support both bare array and wrapped { propositions: [...] } formats
          const items = Array.isArray(partial) ? partial : partial?.propositions;
          if (Array.isArray(items) && items.length > 0) {
            setStreamingNodes(toPropositionNodes(items, labelMap));
          }
        } catch {
          // partial-json parse failed — wait for more tokens
        }
      }, 50);

      const { text: finalText } = await fetchStreamingApi(
        "/api/decomposition/extract",
        { documents },
        { onToken },
      );

      // Parse the final complete JSON — support both bare array and wrapped { propositions: [...] }
      const parsed = JSON.parse(stripCodeFences(finalText));
      const propositions = Array.isArray(parsed) ? parsed : parsed.propositions;
      const nodes = toPropositionNodes(propositions, labelMap);

      setState((prev) => ({ ...prev, nodes, extractionStatus: "done" }));
      setStreamingNodes(null);
    } catch (err) {
      console.error("[decomposition]", err);
      setState((prev) => ({ ...prev, extractionStatus: "error" }));
      setStreamingNodes(null);
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

  // --- Graph editing operations ---

  const addGraphNode = useCallback((input: NewNodeInput): string => {
    let newId = "";
    setState((prev) => {
      const [nodes, id] = addNodeOp(prev.nodes, input);
      newId = id;
      return { ...prev, nodes };
    });
    return newId;
  }, []);

  const removeGraphNode = useCallback((nodeId: string) => {
    setState((prev) => ({
      ...prev,
      nodes: removeNodeOp(prev.nodes, nodeId),
      selectedNodeId: prev.selectedNodeId === nodeId ? null : prev.selectedNodeId,
    }));
  }, []);

  const renameGraphNode = useCallback((nodeId: string, label: string) => {
    setState((prev) => ({ ...prev, nodes: renameNodeOp(prev.nodes, nodeId, label) }));
  }, []);

  const updateNodeStatement = useCallback((nodeId: string, statement: string) => {
    setState((prev) => ({ ...prev, nodes: updateNodeStatementOp(prev.nodes, nodeId, statement) }));
  }, []);

  /** Returns false if the edge would create a cycle, already exists, or references a non-existent node. */
  const addGraphEdge = useCallback((fromId: string, toId: string): boolean => {
    // Use nodesRef for fresh state — avoids stale-closure risk when edges are
    // added in rapid succession (the ref is updated on every render).
    const result = addEdgeOp(nodesRef.current, fromId, toId);
    if (result) {
      setState((prev) => ({ ...prev, nodes: result }));
      return true;
    }
    return false;
  }, []);

  const removeGraphEdge = useCallback((fromId: string, toId: string) => {
    setState((prev) => ({ ...prev, nodes: removeEdgeOp(prev.nodes, fromId, toId) }));
  }, []);

  const updateGraphLayout = useCallback((layout: GraphLayout) => {
    setState((prev) => ({ ...prev, graphLayout: layout }));
  }, []);

  /** Restore persisted decomposition state (called once on mount) */
  const resetState = useCallback(
    (restored: { nodes: PropositionNode[]; selectedNodeId: string | null; paperText: string; sources?: SourceDocument[]; graphLayout?: GraphLayout }) => {
      setState({
        nodes: restored.nodes,
        selectedNodeId: restored.selectedNodeId,
        paperText: restored.paperText,
        sources: restored.sources ?? [],
        extractionStatus: restored.nodes.length > 0 ? "done" : "idle",
        graphLayout: restored.graphLayout,
      });
    },
    [],
  );

  return {
    state,
    selectedNode,
    extractPropositions,
    selectNode,
    updateNode,
    // Graph editing
    addGraphNode,
    removeGraphNode,
    renameGraphNode,
    updateNodeStatement,
    addGraphEdge,
    removeGraphEdge,
    updateGraphLayout,
    resetState,
    streamingNodes,
  };
}
