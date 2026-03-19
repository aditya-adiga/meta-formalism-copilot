"use client";

import { useState, useCallback, useMemo } from "react";
import type { ArtifactType } from "@/app/lib/types/session";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";
import { ARTIFACT_ROUTE, ARTIFACT_RESPONSE_KEY } from "@/app/lib/types/artifacts";
import { generateSemiformalStreaming, fetchJsonArtifactStreaming } from "@/app/lib/formalization/api";
import { throttle } from "@/app/lib/utils/throttle";
import { parse as parsePartialJson } from "partial-json";

export type ArtifactLoadingState = Partial<Record<ArtifactType, "idle" | "generating" | "done" | "error">>;

/**
 * Fires parallel artifact generation requests for selected types.
 *
 * Special cases:
 * - "semiformal" calls the existing semiformal route (returns { proof })
 * - "lean" is never generated here — it's step 2 of the deductive pipeline
 * - All other types use ARTIFACT_ROUTE and return JSON keyed by their type
 */
export function useArtifactGeneration() {
  const [loadingState, setLoadingState] = useState<ArtifactLoadingState>({});
  const [streamingPreview, setStreamingPreview] = useState<Partial<Record<ArtifactType, string>>>({});
  const [streamingJsonPreview, setStreamingJsonPreview] = useState<Partial<Record<ArtifactType, unknown>>>({});

  const generateArtifacts = useCallback(async (
    selectedTypes: ArtifactType[],
    request: ArtifactGenerationRequest,
  ): Promise<Partial<Record<ArtifactType, unknown>>> => {
    // Filter out "lean" — it's never directly generated via this hook
    const types = selectedTypes.filter((t) => t !== "lean");
    if (types.length === 0) return {};

    // Set all selected types to "generating"
    const initialState: ArtifactLoadingState = {};
    for (const t of types) initialState[t] = "generating";
    setLoadingState(initialState);
    setStreamingPreview({});
    setStreamingJsonPreview({});

    const promises = types.map(async (type): Promise<[ArtifactType, unknown | null]> => {
      try {
        if (type === "semiformal") {
          const onToken = throttle((accumulated: string) => {
            setStreamingPreview((prev) => ({ ...prev, semiformal: accumulated }));
          }, 50);
          const proof = await generateSemiformalStreaming(request.sourceText, request.context, onToken);
          return [type, proof];
        }

        const route = ARTIFACT_ROUTE[type];
        if (!route) return [type, null];

        // Stream JSON artifacts with partial-JSON parsing for progressive rendering
        const onPartial = throttle((accumulated: string) => {
          setStreamingPreview((prev) => ({ ...prev, [type]: accumulated }));
          try {
            const partial = parsePartialJson(accumulated);
            if (partial && typeof partial === "object") {
              setStreamingJsonPreview((prev) => ({ ...prev, [type]: partial }));
            }
          } catch {
            // partial-json parse failed — keep previous preview
          }
        }, 50);

        const finalText = await fetchJsonArtifactStreaming(route, request, onPartial);

        // Parse the final complete JSON
        try {
          const { stripCodeFences } = await import("@/app/lib/utils/stripCodeFences");
          const parsed = JSON.parse(stripCodeFences(finalText));
          const responseKey = ARTIFACT_RESPONSE_KEY[type];
          return [type, parsed[responseKey] ?? parsed];
        } catch {
          console.error(`[${type}] Failed to parse final JSON`);
          return [type, null];
        }
      } catch (err) {
        console.error(`[${type}]`, err);
        return [type, null];
      }
    });

    const settled = await Promise.allSettled(promises);

    const results: Partial<Record<ArtifactType, unknown>> = {};
    const finalState: ArtifactLoadingState = {};

    for (const result of settled) {
      if (result.status === "fulfilled") {
        const [type, value] = result.value;
        finalState[type] = value != null ? "done" : "error";
        if (value != null) results[type] = value;
      }
    }

    setLoadingState(finalState);
    setStreamingPreview({});
    setStreamingJsonPreview({});
    return results;
  }, []);

  const isAnyGenerating = useMemo(
    () => Object.values(loadingState).some((s) => s === "generating"),
    [loadingState],
  );

  return { loadingState, streamingPreview, streamingJsonPreview, generateArtifacts, isAnyGenerating };
}
