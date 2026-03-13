"use client";

import { useState, useCallback, useRef } from "react";
import type { PropositionNode } from "@/app/lib/types/decomposition";
import { topologicalSort } from "@/app/lib/utils/topologicalSort";
import { formalizeNode, type CancelSignal } from "@/app/lib/formalization/formalizeNode";

export type QueueStatus = "idle" | "running" | "paused" | "done";

export type QueueProgress = {
  status: QueueStatus;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentNodeId: string | null;
};

const INITIAL_PROGRESS: QueueProgress = {
  status: "idle",
  total: 0,
  completed: 0,
  failed: 0,
  skipped: 0,
  currentNodeId: null,
};

export function useAutoFormalizeQueue(
  nodes: PropositionNode[],
  updateNode: (id: string, updates: Partial<PropositionNode>) => void,
) {
  const [progress, setProgress] = useState<QueueProgress>(INITIAL_PROGRESS);

  // Refs for pause/cancel to avoid stale closures in the async loop
  const pauseRef = useRef(false);
  const cancelSignalRef = useRef<CancelSignal>({ cancelled: false });
  const runningRef = useRef(false);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    pauseRef.current = false;
    cancelSignalRef.current = { cancelled: false };

    const sorted = topologicalSort(nodes);

    // Filter to only unverified nodes
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const toProcess = sorted.filter((id) => {
      const n = nodeMap.get(id);
      return n && n.verificationStatus !== "verified";
    });

    setProgress({
      status: "running",
      total: toProcess.length,
      completed: 0,
      failed: 0,
      skipped: 0,
      currentNodeId: null,
    });

    // Track which nodes failed so we can skip dependents
    const failedIds = new Set<string>();

    let completed = 0;
    let failed = 0;
    let skipped = 0;

    for (const nodeId of toProcess) {
      // Check cancel
      if (cancelSignalRef.current.cancelled) break;

      // Check pause — wait until resumed or cancelled
      if (pauseRef.current) {
        setProgress((p) => ({ ...p, status: "paused", currentNodeId: null }));
        await new Promise<void>((resolve) => {
          const check = () => {
            if (!pauseRef.current || cancelSignalRef.current.cancelled) {
              resolve();
            } else {
              setTimeout(check, 200);
            }
          };
          check();
        });
        if (cancelSignalRef.current.cancelled) break;
        setProgress((p) => ({ ...p, status: "running" }));
      }

      // Re-read node state from the latest nodes array via the map
      // Note: we use the nodeMap built at start time for dependency checks.
      // The actual node data for formalization will be read fresh below.
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      // Skip if already verified (may have been verified by a resumed queue)
      if (node.verificationStatus === "verified") {
        completed++;
        setProgress((p) => ({ ...p, completed }));
        continue;
      }

      // Check if any dependency failed — skip this node
      const hasFailedDep = node.dependsOn.some((depId) => failedIds.has(depId));
      if (hasFailedDep) {
        const failedDepId = node.dependsOn.find((depId) => failedIds.has(depId));
        updateNode(nodeId, {
          verificationStatus: "failed",
          verificationErrors: `Skipped: dependency ${failedDepId} failed`,
        });
        failedIds.add(nodeId);
        skipped++;
        setProgress((p) => ({ ...p, skipped }));
        continue;
      }

      setProgress((p) => ({ ...p, currentNodeId: nodeId }));

      const result = await formalizeNode(node, nodes, updateNode, cancelSignalRef.current);

      if (cancelSignalRef.current.cancelled) break;

      if (result === "verified") {
        completed++;
        setProgress((p) => ({ ...p, completed }));
      } else {
        failedIds.add(nodeId);
        failed++;
        setProgress((p) => ({ ...p, failed }));
      }
    }

    runningRef.current = false;
    setProgress((p) => ({
      ...p,
      status: "done",
      currentNodeId: null,
    }));
  }, [nodes, updateNode]);

  const pause = useCallback(() => {
    pauseRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pauseRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    cancelSignalRef.current.cancelled = true;
    pauseRef.current = false; // unblock if paused
    runningRef.current = false;
    setProgress((p) => ({ ...p, status: "done", currentNodeId: null }));
  }, []);

  return { progress, start, pause, resume, cancel };
}
