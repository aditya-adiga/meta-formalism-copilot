"use client";

import { useState, useCallback, useMemo } from "react";
import type { ArtifactType } from "@/app/lib/types/session";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";
import { ARTIFACT_ROUTE, ARTIFACT_RESPONSE_KEY } from "@/app/lib/types/artifacts";
import { fetchStreamingApi } from "@/app/lib/formalization/api";
import { throttle } from "@/app/lib/utils/throttle";
import { parse as parsePartialJson } from "partial-json";
import { stripCodeFences, stripLeadingCodeFence } from "@/app/lib/utils/stripCodeFences";

export type ArtifactLoadingState = Partial<Record<ArtifactType, "idle" | "generating" | "done" | "error">>;

/**
 * Fires parallel artifact generation requests for selected types.
 *
 * Special cases:
 * - "lean" is never generated here — it's step 2 of the deductive pipeline
 * - "semiformal" is handled by useFormalizationPipeline, not this hook
 * - All other types use ARTIFACT_ROUTE and return JSON keyed by their type
 */
export function useArtifactGeneration() {
  const [loadingState, setLoadingState] = useState<ArtifactLoadingState>({});
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
    setStreamingJsonPreview({});

    const promises = types.map(async (type): Promise<[ArtifactType, unknown | null]> => {
      try {
        const route = ARTIFACT_ROUTE[type];
        if (!route) return [type, null];

        // Stream JSON artifacts with partial-JSON parsing for progressive rendering
        const responseKey = ARTIFACT_RESPONSE_KEY[type];
        const onPartial = throttle((accumulated: string) => {
          try {
            const partial = parsePartialJson(stripLeadingCodeFence(accumulated));
            if (partial && typeof partial === "object") {
              // Extract inner value by response key (e.g. {"causalGraph": {...}} → {...})
              // so the preview matches what panels expect.
              // Guard: if the extracted value is an array, it's a field-name collision
              // (e.g. counterexamples.counterexamples) — use the full object instead.
              const candidate = (partial as Record<string, unknown>)[responseKey];
              const inner = (candidate != null && !Array.isArray(candidate)) ? candidate : partial;
              setStreamingJsonPreview((prev) => ({ ...prev, [type]: inner }));
            }
          } catch {
            // partial-json parse failed — keep previous preview
          }
        }, 50);

        const { text: finalText } = await fetchStreamingApi(route, request, { onToken: onPartial });

        // Parse the final complete JSON
        try {
          const parsed = JSON.parse(stripCodeFences(finalText));
          const candidate = parsed[responseKey];
          return [type, (candidate != null && !Array.isArray(candidate)) ? candidate : parsed];
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
    // Preview is cleared at the start of the next generation (not here) to
    // avoid a flash between preview clear and final data store write.
    return results;
  }, []);

  const isAnyGenerating = useMemo(
    () => Object.values(loadingState).some((s) => s === "generating"),
    [loadingState],
  );

  return { loadingState, streamingJsonPreview, generateArtifacts, isAnyGenerating };
}
