import { describe, it, expect } from "vitest";
import { transformSseStream } from "./transformSseStream";
import { sseEvent } from "./streamLlm";

/** Push chunks through a transformSseStream and collect the output. */
async function runTransform(
  chunks: Uint8Array[],
  onDone: (data: { text: string; usage: { provider: string }; [key: string]: unknown }) => void,
): Promise<string> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const transformed = stream.pipeThrough(transformSseStream(onDone));
  const reader = transformed.getReader();
  const decoder = new TextDecoder();
  let result = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

const enc = new TextEncoder();

describe("transformSseStream", () => {
  it("passes through token events unchanged", async () => {
    const tokenEvent = 'event: token\ndata: {"text":"hello"}\n\n';
    const doneEvent = sseEvent("done", { text: "hello", usage: { provider: "anthropic" } });

    const result = await runTransform(
      [enc.encode(tokenEvent), doneEvent],
      () => {},
    );

    expect(result).toContain('event: token\ndata: {"text":"hello"}');
    expect(result).toContain("event: done");
  });

  it("calls onDone with parsed data and forwards modified result", async () => {
    const doneData = { text: "original", usage: { provider: "mock" } };
    const chunk = sseEvent("done", doneData);

    const result = await runTransform([chunk], (data) => {
      data.text = "replaced";
    });

    expect(result).toContain('"text":"replaced"');
    expect(result).not.toContain('"text":"original"');
  });

  it("handles chunk boundaries splitting an SSE event", async () => {
    // Split a single done event across two chunks mid-data
    const fullEvent = 'event: done\ndata: {"text":"split test","usage":{"provider":"test"}}\n\n';
    const midpoint = Math.floor(fullEvent.length / 2);
    const chunk1 = enc.encode(fullEvent.slice(0, midpoint));
    const chunk2 = enc.encode(fullEvent.slice(midpoint));

    let called = false;
    const result = await runTransform([chunk1, chunk2], (data) => {
      called = true;
      expect(data.text).toBe("split test");
    });

    expect(called).toBe(true);
    expect(result).toContain("event: done");
  });

  it("forwards unrecognized blocks as-is", async () => {
    // A block that doesn't match the event: / data: pattern
    const weirdBlock = "some random text\n\n";
    const doneEvent = sseEvent("done", { text: "ok", usage: { provider: "test" } });

    const result = await runTransform(
      [enc.encode(weirdBlock), doneEvent],
      () => {},
    );

    expect(result).toContain("some random text");
    expect(result).toContain("event: done");
  });

  it("forwards done event unchanged when JSON parse fails in data", async () => {
    // Malformed JSON in a done event — should forward the raw block
    const badDone = "event: done\ndata: {not valid json}\n\n";
    const result = await runTransform([enc.encode(badDone)], () => {});

    expect(result).toContain("event: done");
    expect(result).toContain("{not valid json}");
  });

  it("flushes buffered content on stream close", async () => {
    // Content without a trailing \n\n — should be flushed
    const partial = "event: token\ndata: {\"text\":\"trailing\"}";
    const result = await runTransform([enc.encode(partial)], () => {});

    expect(result).toContain("trailing");
  });

  it("handles multiple events in a single chunk", async () => {
    const combined =
      'event: token\ndata: {"text":"a"}\n\n' +
      'event: token\ndata: {"text":"b"}\n\n' +
      'event: done\ndata: {"text":"ab","usage":{"provider":"test"}}\n\n';

    let doneText = "";
    const result = await runTransform([enc.encode(combined)], (data) => {
      doneText = data.text;
    });

    expect(doneText).toBe("ab");
    expect(result).toContain('{"text":"a"}');
    expect(result).toContain('{"text":"b"}');
    expect(result).toContain("event: done");
  });
});
