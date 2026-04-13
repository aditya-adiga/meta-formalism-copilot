"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import type { ArtifactType } from "@/app/lib/types/session";
import type { ArtifactGenerationRequest } from "@/app/lib/types/artifacts";
import { ARTIFACT_ROUTE, ARTIFACT_RESPONSE_KEY } from "@/app/lib/types/artifacts";
import { generateSemiformalStreaming, fetchStreamingApi } from "@/app/lib/formalization/api";
import { throttle } from "@/app/lib/utils/throttle";
import { parse as parsePartialJson } from "partial-json";
import { stripCodeFences, stripLeadingCodeFence } from "@/app/lib/utils/stripCodeFences";

export type ArtifactLoadingState = Partial<Record<ArtifactType, "idle" | "generating" | "done" | "error">>;

/** Return a shallow copy of `obj` with `keys` removed. Returns `obj` unchanged if no keys match. */
function omitKeys<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T {
  let changed = false;
  for (const k of keys) { if (k in obj) { changed = true; break; } }
  if (!changed) return obj;
  const next = { ...obj };
  for (const k of keys) delete next[k];
  return next;
}

/**
 * Fires parallel artifact generation requests for selected types.
 *
 * Supports concurrent generation (e.g. global + node, or multiple nodes) by
 * using per-type generation counters. Each call only touches state for the
 * types it owns, and stale callbacks (from a superseded generation of the
 * same type) are silently ignored.
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

  // Per-type generation counter — incremented each time a type starts generating.
  // Streaming callbacks capture the counter at call time and bail if superseded.
  const generationIdRef = useRef<Partial<Record<ArtifactType, number>>>({});

  const generateArtifacts = useCallback(async (
    selectedTypes: ArtifactType[],
    request: ArtifactGenerationRequest,
  ): Promise<Partial<Record<ArtifactType, unknown>>> => {
    // Filter out "lean" — it's never directly generated via this hook
    const types = selectedTypes.filter((t) => t !== "lean");
    if (types.length === 0) return {};

    // Increment generation IDs and capture this call's snapshot
    const myGenIds: Partial<Record<ArtifactType, number>> = {};
    for (const t of types) {
      generationIdRef.current[t] = (generationIdRef.current[t] ?? 0) + 1;
      myGenIds[t] = generationIdRef.current[t];
    }
    const isCurrent = (type: ArtifactType) =>
      generationIdRef.current[type] === myGenIds[type];

    setLoadingState((prev) => {
      const next = { ...prev };
      for (const t of types) next[t] = "generating";
      return next;
    });
    setStreamingPreview((prev) => omitKeys(prev, types));
    setStreamingJsonPreview((prev) => omitKeys(prev, types));

    const promises = types.map(async (type): Promise<[ArtifactType, unknown | null]> => {
      try {
        if (type === "semiformal") {
          const onToken = throttle((accumulated: string) => {
            if (!isCurrent(type)) return;
            setStreamingPreview((prev) => ({ ...prev, semiformal: accumulated }));
          }, 50);
          const proof = await generateSemiformalStreaming(request.sourceText, request.context, onToken);
          return [type, proof];
        }

        const route = ARTIFACT_ROUTE[type];
        if (!route) return [type, null];

        // Stream JSON artifacts with partial-JSON parsing for progressive rendering
        const responseKey = ARTIFACT_RESPONSE_KEY[type];
        const onPartial = throttle((accumulated: string) => {
          if (!isCurrent(type)) return;
          try {
            const partial = parsePartialJson(stripLeadingCodeFence(accumulated));
            if (partial && typeof partial === "object") {
              // Extract inner value by response key (e.g. {"causalGraph": {...}} → {...})
              // so the preview matches what panels expect.
              const inner = (partial as Record<string, unknown>)[responseKey] ?? partial;
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

    // Build results from settled promises, discarding superseded types
    const results: Partial<Record<ArtifactType, unknown>> = {};
    for (const result of settled) {
      if (result.status === "fulfilled") {
        const [type, value] = result.value;
        if (value != null && isCurrent(type)) results[type] = value;
      }
    }

    // Only update loading state for types where this generation is still current
    setLoadingState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const result of settled) {
        if (result.status === "fulfilled") {
          const [type, value] = result.value;
          if (isCurrent(type)) {
            next[type] = value != null ? "done" : "error";
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });

    // Caller clears previews via clearStreamingPreviews() AFTER persisting
    // final data, avoiding a render frame with neither data nor preview.
    return results;
  }, []);

  /** Clear streaming previews. Pass specific types to scope the clear,
   *  or omit to clear all (backward-compatible fallback). */
  const clearStreamingPreviews = useCallback((types?: ArtifactType[]) => {
    if (!types) {
      setStreamingPreview({});
      setStreamingJsonPreview({});
      return;
    }
    setStreamingPreview((prev) => omitKeys(prev, types));
    setStreamingJsonPreview((prev) => omitKeys(prev, types));
  }, []);

  const isAnyGenerating = useMemo(
    () => Object.values(loadingState).some((s) => s === "generating"),
    [loadingState],
  );

  return { loadingState, streamingPreview, streamingJsonPreview, generateArtifacts, clearStreamingPreviews, isAnyGenerating };
}
