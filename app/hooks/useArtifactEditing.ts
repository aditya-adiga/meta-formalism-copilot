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

