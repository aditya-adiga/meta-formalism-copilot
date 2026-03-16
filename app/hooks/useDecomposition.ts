"use client";

import { useState, useCallback } from "react";
import type { DecompositionState, PropositionNode, NodeGroup, SourceDocument } from "@/app/lib/types/decomposition";

const INITIAL_STATE: DecompositionState = {
  nodes: [],
  selectedNodeId: null,
  selectedNodeIds: [],
  activeGroupId: null,
  groups: [],
  paperText: "",
  sources: [],
  extractionStatus: "idle",
};

export function useDecomposition() {
  const [state, setState] = useState<DecompositionState>(INITIAL_STATE);

  const selectedNode: PropositionNode | null =
    state.nodes.find((n) => n.id === state.selectedNodeId) ?? null;

  /** Nodes currently in the multi-selection */
  const selectedNodes: PropositionNode[] =
    state.selectedNodeIds
      .map((id) => state.nodes.find((n) => n.id === id))
      .filter((n): n is PropositionNode => n != null);

  /** The active group object, if any */
  const activeGroup: NodeGroup | null =
    state.groups.find((g) => g.id === state.activeGroupId) ?? null;

  const extractPropositions = useCallback(async (documents: SourceDocument[], pdfFile?: File | null) => {
    const combinedText = documents.map((d) => d.text).join("\n\n");
    setState((prev) => ({ ...prev, paperText: combinedText, sources: documents, extractionStatus: "extracting", nodes: [], selectedNodeId: null, selectedNodeIds: [], activeGroupId: null }));

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

  /** Single-click select: sets both selectedNodeId and selectedNodeIds to just this node */
  const selectNode = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedNodeId: id,
      selectedNodeIds: id ? [id] : [],
      activeGroupId: null,
    }));
  }, []);

  /** Toggle a node in/out of multi-selection (shift/ctrl+click) */
  const toggleNodeSelection = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.selectedNodeIds.indexOf(id);
      const newIds = idx >= 0
        ? prev.selectedNodeIds.filter((nid) => nid !== id)
        : [...prev.selectedNodeIds, id];
      return {
        ...prev,
        selectedNodeIds: newIds,
        // Clear single-select when multi-selecting
        selectedNodeId: newIds.length === 1 ? newIds[0] : null,
        activeGroupId: null,
      };
    });
  }, []);

  /** Set multi-selection to specific node IDs */
  const selectNodes = useCallback((ids: string[]) => {
    setState((prev) => ({
      ...prev,
      selectedNodeIds: ids,
      selectedNodeId: ids.length === 1 ? ids[0] : null,
      activeGroupId: null,
    }));
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<PropositionNode>) => {
    setState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    }));
  }, []);

  /** Create a new saved group. Returns the group id. */
  const createGroup = useCallback((name: string, nodeIds: string[]): string => {
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const group: NodeGroup = {
      id,
      name,
      nodeIds,
      semiformalProof: "",
      leanCode: "",
      verificationStatus: "unverified",
      verificationErrors: "",
      context: "",
    };
    setState((prev) => ({
      ...prev,
      groups: [...prev.groups, group],
      activeGroupId: id,
    }));
    return id;
  }, []);

  /** Update an existing group */
  const updateGroup = useCallback((id: string, updates: Partial<NodeGroup>) => {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    }));
  }, []);

  /** Delete a saved group */
  const deleteGroup = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      groups: prev.groups.filter((g) => g.id !== id),
      activeGroupId: prev.activeGroupId === id ? null : prev.activeGroupId,
    }));
  }, []);

  /** Recall a saved group: set selection to the group's nodes */
  const setActiveGroup = useCallback((groupId: string | null) => {
    setState((prev) => {
      if (!groupId) {
        return { ...prev, activeGroupId: null };
      }
      const group = prev.groups.find((g) => g.id === groupId);
      if (!group) return prev;
      return {
        ...prev,
        activeGroupId: groupId,
        selectedNodeIds: group.nodeIds,
        selectedNodeId: null,
      };
    });
  }, []);

  /** Restore persisted decomposition state (called once on mount) */
  const resetState = useCallback(
    (restored: { nodes: PropositionNode[]; selectedNodeId: string | null; paperText: string; groups?: NodeGroup[] }) => {
      setState({
        nodes: restored.nodes,
        selectedNodeId: restored.selectedNodeId,
        selectedNodeIds: restored.selectedNodeId ? [restored.selectedNodeId] : [],
        activeGroupId: null,
        groups: restored.groups ?? [],
        paperText: restored.paperText,
        sources: [],
        extractionStatus: restored.nodes.length > 0 ? "done" : "idle",
      });
    },
    [],
  );

  return {
    state, selectedNode, selectedNodes, activeGroup,
    extractPropositions, selectNode, toggleNodeSelection, selectNodes,
    updateNode,
    createGroup, updateGroup, deleteGroup, setActiveGroup,
    resetState,
  };
}
