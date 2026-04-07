"use client";

import { useState, useCallback, useMemo } from "react";
import type { ArtifactType, BuiltinArtifactType } from "@/app/lib/types/session";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";
import { ARTIFACT_ROUTE, ARTIFACT_RESPONSE_KEY } from "@/app/lib/types/artifacts";
import { generateSemiformal, fetchApi } from "@/app/lib/formalization/api";
import { isCustomType } from "@/app/lib/types/customArtifact";
import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";

export type ArtifactLoadingState = Partial<Record<ArtifactType, "idle" | "generating" | "done" | "error">>;

/**
 * Fires parallel artifact generation requests for selected types.
 *
 * Special cases:
 * - "semiformal" calls the existing semiformal route (returns { proof })
 * - "lean" is never generated here — it's step 2 of the deductive pipeline
 * - Custom types (prefixed "custom-") use /api/formalization/custom with the
 *   system prompt in the request body
 * - All other built-in types use ARTIFACT_ROUTE and return JSON keyed by their type
 */
export function useArtifactGeneration() {
  const [loadingState, setLoadingState] = useState<ArtifactLoadingState>({});

  const generateArtifacts = useCallback(async (
    selectedTypes: ArtifactType[],
    request: ArtifactGenerationRequest,
    customTypeDefs?: CustomArtifactTypeDefinition[],
  ): Promise<Partial<Record<ArtifactType, unknown>>> => {
    // Filter out "lean" — it's never directly generated via this hook
    const types = selectedTypes.filter((t) => t !== "lean");
    if (types.length === 0) return {};

    // Index custom definitions by ID for fast lookup
    const customDefsMap = new Map(
      (customTypeDefs ?? []).map((d) => [d.id, d]),
    );

    // Set all selected types to "generating"
    const initialState: ArtifactLoadingState = {};
    for (const t of types) initialState[t] = "generating";
    setLoadingState(initialState);

    const promises = types.map(async (type): Promise<[ArtifactType, unknown | null]> => {
      try {
        if (type === "semiformal") {
          const proof = await generateSemiformal(request.sourceText, request.context);
          return [type, proof];
        }

        // Custom artifact types: send the system prompt in the request body
        if (isCustomType(type)) {
          const def = customDefsMap.get(type);
          if (!def) return [type, null];

          const data = await fetchApi<Record<string, unknown>>(
            "/api/formalization/custom",
            {
              ...request,
              customSystemPrompt: def.systemPrompt,
              customOutputFormat: def.outputFormat,
            },
          );
          return [type, data.result ?? null];
        }

        // Built-in artifact types
        const route = ARTIFACT_ROUTE[type as BuiltinArtifactType];
        if (!route) return [type, null];

        const data = await fetchApi<Record<string, unknown>>(route, request);
        const responseKey = ARTIFACT_RESPONSE_KEY[type as BuiltinArtifactType];
        return [type, data[responseKey] ?? null];
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
    return results;
  }, []);

  const isAnyGenerating = useMemo(
    () => Object.values(loadingState).some((s) => s === "generating"),
    [loadingState],
  );

  return { loadingState, generateArtifacts, isAnyGenerating };
}
