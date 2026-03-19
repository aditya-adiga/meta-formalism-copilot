/** Shared HTTP helpers for the formalization pipeline. */

import type { LlmCallUsage } from "@/app/lib/llm/callLlm";

/** Fetch a JSON API route, throwing on non-OK responses. */
export async function fetchApi<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export type StreamCallbacks = {
  onToken: (accumulated: string) => void;
};

type StreamResult = {
  text: string;
  usage: LlmCallUsage;
};

/**
 * Fetch an SSE streaming API route. Sends `{ ...body, stream: true }`,
 * reads token events progressively, and returns the final text + usage.
 */
export async function fetchStreamingApi(
  url: string,
  body: Record<string, unknown>,
  callbacks: StreamCallbacks,
): Promise<StreamResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error ?? "Request failed");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let finalResult: StreamResult | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    // Keep the last (potentially incomplete) block in the buffer
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      if (!block.trim()) continue;

      let eventType = "";
      let dataStr = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7);
        else if (line.startsWith("data: ")) dataStr = line.slice(6);
      }

      if (!eventType || !dataStr) continue;

      if (eventType === "token") {
        try {
          const parsed = JSON.parse(dataStr);
          accumulated += parsed.text;
          callbacks.onToken(accumulated);
        } catch { /* skip malformed */ }
      } else if (eventType === "done") {
        try {
          const parsed = JSON.parse(dataStr);
          finalResult = { text: parsed.text, usage: parsed.usage };
        } catch { /* skip malformed */ }
      } else if (eventType === "error") {
        try {
          const parsed = JSON.parse(dataStr);
          throw new Error(parsed.error ?? "Stream error");
        } catch (e) {
          if (e instanceof Error && e.message !== "Stream error") throw e;
          throw new Error("Stream error");
        }
      }
    }
  }

  if (!finalResult) throw new Error("Stream ended without a done event");
  return finalResult;
}

export async function verifyLean(leanCode: string) {
  const res = await fetch("/api/verification/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leanCode }),
  });
  const data = await res.json();
  return { valid: Boolean(data.valid), errors: (data.errors as string | undefined) ?? "" };
}

export async function generateLean(
  informalProof: string,
  previousAttempt?: string,
  errors?: string,
  instruction?: string,
  contextLeanCode?: string,
) {
  const data = await fetchApi<{ leanCode: string }>(
    "/api/formalization/lean",
    { informalProof, previousAttempt, errors, instruction, contextLeanCode },
  );
  return data.leanCode;
}

/** Streaming variant of generateLean — calls onToken with accumulated text as tokens arrive. */
export async function generateLeanStreaming(
  informalProof: string,
  onToken: (accumulated: string) => void,
  previousAttempt?: string,
  errors?: string,
  instruction?: string,
  contextLeanCode?: string,
): Promise<string> {
  const result = await fetchStreamingApi(
    "/api/formalization/lean",
    { informalProof, previousAttempt, errors, instruction, contextLeanCode },
    { onToken },
  );
  return result.text;
}

export async function generateSemiformal(sourceText: string, context?: string) {
  const data = await fetchApi<{ proof: string }>(
    "/api/formalization/semiformal",
    { sourceText, context: context ?? "" },
  );
  return data.proof;
}

/** Streaming variant of generateSemiformal — calls onToken with accumulated text as tokens arrive. */
export async function generateSemiformalStreaming(
  sourceText: string,
  context: string | undefined,
  onToken: (accumulated: string) => void,
): Promise<string> {
  const result = await fetchStreamingApi(
    "/api/formalization/semiformal",
    { sourceText, context: context ?? "" },
    { onToken },
  );
  return result.text;
}
