import { describe, it, expect, vi, beforeEach } from "vitest";
import { sseEvent, streamLlm } from "./streamLlm";

// Mock dependencies
vi.mock("./cache", () => ({
  computeHash: vi.fn(() => "testhash"),
  getCachedResult: vi.fn(() => null),
  setCachedResult: vi.fn(),
}));

vi.mock("@/app/lib/analytics/persist", () => ({
  appendAnalyticsEntry: vi.fn(),
}));

vi.mock("./costs", () => ({
  computeCost: vi.fn(() => 0.01),
}));

// Clear env vars before each test
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

/** Read all SSE events from a ReadableStream and parse them. */
async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<Array<{ event: string; data: unknown }>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: unknown }> = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  const blocks = buffer.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    let eventType = "";
    let dataStr = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) dataStr = line.slice(6);
    }
    if (eventType && dataStr) {
      events.push({ event: eventType, data: JSON.parse(dataStr) });
    }
  }

  return events;
}

describe("sseEvent", () => {
  it("formats a valid SSE event", () => {
    const result = new TextDecoder().decode(sseEvent("token", { text: "hello" }));
    expect(result).toBe('event: token\ndata: {"text":"hello"}\n\n');
  });
});

describe("streamLlm", () => {
  it("returns mock done event when no API keys configured", async () => {
    const stream = streamLlm({
      endpoint: "test",
      systemPrompt: "sys",
      userContent: "user",
      maxTokens: 100,
    });

    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("done");

    const data = events[0].data as { text: string; usage: { provider: string } };
    expect(data.text).toBe("");
    expect(data.usage.provider).toBe("mock");
  });

  it("returns cached result as single done event", async () => {
    const { getCachedResult } = await import("./cache");
    vi.mocked(getCachedResult).mockResolvedValueOnce({
      text: "cached text",
      usage: {
        provider: "cache",
        model: "test",
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0,
        latencyMs: 0,
      },
      cacheHash: "testhash",
    });

    const stream = streamLlm({
      endpoint: "test",
      systemPrompt: "sys",
      userContent: "user",
      maxTokens: 100,
    });

    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("done");

    const data = events[0].data as { text: string; usage: { provider: string } };
    expect(data.text).toBe("cached text");
    expect(data.usage.provider).toBe("cache");
  });
});

describe("fetchStreamingApi client-side parser", () => {
  it("parses token and done events from SSE stream", async () => {
    // Simulate an SSE response body
    const sseText = [
      'event: token\ndata: {"text":"Hello"}',
      'event: token\ndata: {"text":" world"}',
      'event: done\ndata: {"text":"Hello world","usage":{"provider":"anthropic","model":"test","inputTokens":10,"outputTokens":5,"costUsd":0.01,"latencyMs":100}}',
    ].join("\n\n") + "\n\n";

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseText));
        controller.close();
      },
    });

    // Import and test fetchStreamingApi
    const { fetchStreamingApi } = await import("@/app/lib/formalization/api");

    // Mock fetch to return our SSE stream
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body,
    });

    const accumulated: string[] = [];
    const result = await fetchStreamingApi(
      "/api/test",
      { foo: "bar" },
      { onToken: (text) => accumulated.push(text) },
    );

    expect(result.text).toBe("Hello world");
    expect(result.usage.provider).toBe("anthropic");
    expect(accumulated).toEqual(["Hello", "Hello world"]);

    globalThis.fetch = originalFetch;
  });
});
