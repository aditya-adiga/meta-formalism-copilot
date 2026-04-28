"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type NodeMouseHandler,
  type NodeDragHandler,
  type OnMoveEnd,
  type OnConnect,
  type OnEdgesDelete,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import type { PropositionNode, GraphLayout } from "@/app/lib/types/decomposition";
import ProofGraphNode from "@/app/components/features/proof-graph/ProofGraphNode";
import { useGraphLayout } from "@/app/components/features/proof-graph/useGraphLayout";

const nodeTypes = { proofNode: ProofGraphNode };

type ProofGraphProps = {
  propositions: PropositionNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  sourceColorMap: Record<string, string>;
  initialPositions?: GraphLayout["positions"];
  onLayoutChange?: (layout: GraphLayout) => void;
  /** Called when user draws an edge between nodes. Returns false if cycle detected. */
  onConnect?: (fromId: string, toId: string) => boolean;
  /** Called when user deletes edges. */
  onEdgesDelete?: (edges: Array<{ source: string; target: string }>) => void;
  /** Called when user deletes a node via context menu. */
  onNodeDelete?: (nodeId: string) => void;
  /** Called when user renames a node via context menu. */
  onNodeRename?: (nodeId: string, label: string) => void;
};

type ContextMenu = {
  nodeId: string;
  x: number;
  y: number;
};

export default function ProofGraph({
  propositions,
  selectedNodeId,
  onSelectNode,
  sourceColorMap,
  initialPositions,
  onLayoutChange,
  onConnect: onConnectProp,
  onEdgesDelete: onEdgesDeleteProp,
  onNodeDelete,
  onNodeRename,
}: ProofGraphProps) {
  const { nodes, edges, onNodesChange, updateNodePosition, getPositions } = useGraphLayout(
    propositions,
    initialPositions,
  );
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const hasFitRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renaming, setRenaming] = useState<{ nodeId: string; label: string } | null>(null);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setContextMenu(null);
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      updateNodePosition(node.id, node.position);
      if (onLayoutChange) {
        const viewport = rfInstanceRef.current?.getViewport();
        onLayoutChange({
          positions: getPositions(),
          viewport: viewport ?? undefined,
        });
      }
    },
    [updateNodePosition, getPositions, onLayoutChange],
  );

  // Debounce viewport persistence to avoid excessive localStorage writes during pan/zoom
  const moveEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
    };
  }, []);

  const handleMoveEnd: OnMoveEnd = useCallback(
    (_event, viewport) => {
      if (!onLayoutChange || !viewport) return;
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
      moveEndTimerRef.current = setTimeout(() => {
        onLayoutChange({
          positions: getPositions(),
          viewport,
        });
      }, 300);
    },
    [getPositions, onLayoutChange],
  );

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    rfInstanceRef.current = instance;
    if (!hasFitRef.current) {
      requestAnimationFrame(() => {
        instance.fitView({ padding: 0.2 });
        hasFitRef.current = true;
      });
    }
  }, []);

  // Re-fit viewport when the node set stabilizes after streaming.
  // Uses a debounced timer so rapid streaming updates don't trigger repeated fits,
  // but the final node set (after streaming ends) gets a clean viewport adjustment.
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevNodeCountRef = useRef(propositions.length);
  useEffect(() => {
    if (!rfInstanceRef.current || !hasFitRef.current) return;
    if (propositions.length !== prevNodeCountRef.current) {
      prevNodeCountRef.current = propositions.length;
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
      fitTimerRef.current = setTimeout(() => {
        rfInstanceRef.current?.fitView({ padding: 0.2 });
      }, 300);
    }
    return () => {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    };
  }, [propositions.length]);

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      if (!onConnectProp || !connection.source || !connection.target) return;
      const ok = onConnectProp(connection.source, connection.target);
      if (!ok) {
        // Could show a toast here — for now the edge just doesn't appear
        console.warn("[ProofGraph] Edge rejected (cycle or duplicate)");
      }
    },
    [onConnectProp],
  );

  const handleEdgesDelete: OnEdgesDelete = useCallback(
    (deletedEdges) => {
      if (!onEdgesDeleteProp) return;
      onEdgesDeleteProp(
        deletedEdges.map((e) => ({ source: e.source, target: e.target })),
      );
    },
    [onEdgesDeleteProp],
  );

  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleDeleteFromMenu = useCallback(() => {
    if (contextMenu && onNodeDelete) {
      onNodeDelete(contextMenu.nodeId);
    }
    setContextMenu(null);
  }, [contextMenu, onNodeDelete]);

  const handleRenameFromMenu = useCallback(() => {
    if (!contextMenu) return;
    const node = propositions.find((p) => p.id === contextMenu.nodeId);
    setRenaming({ nodeId: contextMenu.nodeId, label: node?.label ?? "" });
    setContextMenu(null);
  }, [contextMenu, propositions]);

  const handleRenameSubmit = useCallback(() => {
    if (renaming && onNodeRename) {
      onNodeRename(renaming.nodeId, renaming.label);
    }
    setRenaming(null);
  }, [renaming, onNodeRename]);

  const editable = !!(onConnectProp || onEdgesDeleteProp || onNodeDelete);

  // Inject selection state and source colors into node data
  const finalNodes = useMemo(
    () => nodes.map((n) => ({
      ...n,
      selected: n.id === selectedNodeId,
      draggable: true,
      data: {
        ...n.data,
        sourceColor: sourceColorMap[n.data.sourceId] ?? undefined,
      },
    })),
    [nodes, sourceColorMap, selectedNodeId],
  );

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={finalNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        onInit={handleInit}
        onConnect={onConnectProp ? handleConnect : undefined}
        onEdgesDelete={onEdgesDeleteProp ? handleEdgesDelete : undefined}
        onNodeContextMenu={editable ? handleNodeContextMenu : undefined}
        onPaneClick={handlePaneClick}
        deleteKeyCode={onEdgesDeleteProp ? "Backspace" : null}
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="#DDD9D5" gap={20} />
        <Controls
          showInteractive={false}
          className="!bg-white !border-[#DDD9D5] !shadow-sm"
        />
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-lg border border-[#DDD9D5] bg-white py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {onNodeRename && (
            <button
              onClick={handleRenameFromMenu}
              className="block w-full px-4 py-1.5 text-left text-xs text-[var(--ink-black)] hover:bg-[#F5F1ED]"
            >
              Rename
            </button>
          )}
          {onNodeDelete && (
            <button
              onClick={handleDeleteFromMenu}
              className="block w-full px-4 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            >
              Delete Node
            </button>
          )}
        </div>
      )}

      {/* Inline rename dialog */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-lg border border-[#DDD9D5] bg-white p-4 shadow-xl">
            <label className="mb-2 block text-xs font-medium text-[#6B6560]">
              Rename node
            </label>
            <input
              type="text"
              value={renaming.label}
              onChange={(e) => setRenaming({ ...renaming, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setRenaming(null);
              }}
              autoFocus
              className="mb-3 w-64 rounded border border-[#DDD9D5] px-3 py-1.5 text-sm text-[var(--ink-black)] outline-none focus:border-[#9A9590]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenaming(null)}
                className="rounded px-3 py-1 text-xs text-[#6B6560] hover:bg-[#F5F1ED]"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="rounded bg-[var(--ink-black)] px-3 py-1 text-xs text-white"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
