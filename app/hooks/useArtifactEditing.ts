import { useState, useCallback, useRef, useEffect } from "react";
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
        const data = await fetchApi<{ text: string }>("/api/edit/artifact", {
          content,
          instruction,
        });
        setContent(data.text);
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
 * Convenience hook that creates useArtifactEditing instances for all structured
 * artifact types. Returns a keyed object so callers can do e.g.
 * `artifactEditing.causalGraph.handleAiEdit(...)`.
 */
export function useAllArtifactEditing(props: {
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
  // Use refs so the getContent callbacks are stable across renders
  const refs = useRef(props);
  useEffect(() => { refs.current = props; });

  const causalGraph = useArtifactEditing(
    "causal-graph",
    useCallback(() => refs.current.causalGraph, []),
    useCallback((v: string) => refs.current.setCausalGraph(v), []),
  );
  const statisticalModel = useArtifactEditing(
    "statistical-model",
    useCallback(() => refs.current.statisticalModel, []),
    useCallback((v: string) => refs.current.setStatisticalModel(v), []),
  );
  const propertyTests = useArtifactEditing(
    "property-tests",
    useCallback(() => refs.current.propertyTests, []),
    useCallback((v: string) => refs.current.setPropertyTests(v), []),
  );
  const dialecticalMap = useArtifactEditing(
    "balanced-perspectives",
    useCallback(() => refs.current.dialecticalMap, []),
    useCallback((v: string) => refs.current.setDialecticalMap(v), []),
  );
  const counterexamples = useArtifactEditing(
    "counterexamples",
    useCallback(() => refs.current.counterexamples, []),
    useCallback((v: string) => refs.current.setCounterexamples(v), []),
  );

  return { causalGraph, statisticalModel, propertyTests, dialecticalMap, counterexamples };
}

