import { useState, useCallback } from "react";
import type { ArtifactType } from "@/app/lib/types/session";
import { fetchApi } from "@/app/lib/formalization/api";
import { useWaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";

type Selection = { start: number; end: number; text: string };

/**
 * Hook that manages AI-powered editing for a single structured artifact.
 *
 * Returns handlers for inline edits (selection-based) and whole-document rewrites,
 * plus loading state and wait time estimates.
 */
export function useArtifactEditing(
  artifactType: ArtifactType,
  /** Current JSON string of the artifact content */
  getContent: () => string | null,
  /** Called with the new JSON string after a successful edit */
  setContent: (json: string) => void,
) {
  const [editEndpoint, setEditEndpoint] = useState<string | null>(null);

  const editWaitEstimate = useWaitTimeEstimate(
    editEndpoint,
    (getContent()?.length ?? 0),
  );

  const handleAiEdit = useCallback(async (
    instruction: string,
    selection?: Selection,
  ) => {
    const content = getContent();
    if (!content) return;

    setEditEndpoint(selection ? "edit/artifact-inline" : "edit/artifact-whole");

    try {
      if (selection) {
        const data = await fetchApi<{ text: string }>("/api/edit/artifact", {
          content,
          instruction,
          selection,
        });
        // Replace the selected portion in the content string
        const newContent = content.slice(0, selection.start) + data.text + content.slice(selection.end);
        setContent(newContent);
      } else {
        const data = await fetchApi<{ content: string }>("/api/edit/artifact", {
          content,
          instruction,
        });
        setContent(data.content);
      }
    } catch (err) {
      console.error(`[edit/${artifactType}]`, err);
    } finally {
      setEditEndpoint(null);
    }
  }, [artifactType, getContent, setContent]);

  return {
    editing: editEndpoint !== null,
    editWaitEstimate,
    handleAiEdit,
  };
}

/**
 * Convenience hook that creates editing state for all structured artifact types.
 * Accepts the persisted JSON strings and their setters from useWorkspacePersistence.
 */
export function useAllArtifactEditing(artifacts: {
  causalGraph: string | null;
  setCausalGraph: (v: string) => void;
  statisticalModel: string | null;
  setStatisticalModel: (v: string) => void;
  propertyTests: string | null;
  setPropertyTests: (v: string) => void;
  dialecticalMap: string | null;
  setDialecticalMap: (v: string) => void;
  counterexamples: string | null;
  setCounterexamples: (v: string) => void;
}) {
  const causalGraph = useArtifactEditing(
    "causal-graph",
    () => artifacts.causalGraph,
    (json) => artifacts.setCausalGraph(json),
  );

  const statisticalModel = useArtifactEditing(
    "statistical-model",
    () => artifacts.statisticalModel,
    (json) => artifacts.setStatisticalModel(json),
  );

  const propertyTests = useArtifactEditing(
    "property-tests",
    () => artifacts.propertyTests,
    (json) => artifacts.setPropertyTests(json),
  );

  const dialecticalMap = useArtifactEditing(
    "dialectical-map",
    () => artifacts.dialecticalMap,
    (json) => artifacts.setDialecticalMap(json),
  );

  const counterexamples = useArtifactEditing(
    "counterexamples",
    () => artifacts.counterexamples,
    (json) => artifacts.setCounterexamples(json),
  );

  return { causalGraph, statisticalModel, propertyTests, dialecticalMap, counterexamples };
}
