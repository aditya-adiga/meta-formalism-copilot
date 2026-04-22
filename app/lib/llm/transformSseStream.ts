import { sseEvent } from "./streamLlm";

/**
 * Creates a TransformStream that intercepts SSE events from `streamLlm`,
 * allowing callers to modify the final `done` event (e.g. to substitute
 * mock content or post-process the response text).
 *
 * Handles chunk boundaries correctly by buffering partial events across
 * chunks rather than assuming each chunk contains complete SSE blocks.
 *
 * @param onDone - Called with the parsed `done` event data object.
 *   Mutate `data.text` (or other fields) in-place; the modified object
 *   is re-serialized and forwarded.
 */
export function transformSseStream(
  onDone: (data: { text: string; usage: { provider: string }; [key: string]: unknown }) => void,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  let buffer = "";

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      // Process complete SSE event blocks (terminated by double newline)
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const eventBlock = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        if (!eventBlock.trim()) continue;

        // This regex assumes our own streamLlm output format (single event: line,
        // single data: line). It does not handle multi-line `data:` fields per the
        // full SSE spec — which is fine since we control the producer.
        const eventMatch = eventBlock.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
        if (!eventMatch) {
          // Not a recognized SSE block — forward as-is
          controller.enqueue(textEncoder.encode(eventBlock + "\n\n"));
          continue;
        }

        const [, eventType, dataStr] = eventMatch;
        if (eventType === "done") {
          try {
            const data = JSON.parse(dataStr);
            onDone(data);
            controller.enqueue(sseEvent("done", data));
          } catch {
            // JSON parse failed — forward the original block unchanged
            controller.enqueue(textEncoder.encode(eventBlock + "\n\n"));
          }
        } else {
          // Pass through token and error events unchanged
          controller.enqueue(textEncoder.encode(eventBlock + "\n\n"));
        }
      }
    },
    flush(controller) {
      // Flush any remaining buffered content
      if (buffer.trim()) {
        controller.enqueue(textEncoder.encode(buffer));
      }
    },
  });
}
