import { describe, it, expect, vi, beforeEach } from "vitest";

// Track every Anthropic({ apiKey }) construction so we can assert the
// client is built fresh per call (no module-scope singleton).
const constructorCalls: Array<{ apiKey: string }> = [];
const messagesCreate = vi.fn(async () => ({
  content: [{ type: "text", text: "ok" }],
  usage: { input_tokens: 1, output_tokens: 1 },
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: messagesCreate };
      constructor(opts: { apiKey: string }) {
        constructorCalls.push({ apiKey: opts.apiKey });
      }
    },
  };
});

vi.mock("./cache", () => ({
  computeHash: vi.fn(() => "hash"),
  getCachedResult: vi.fn(async () => null),
  setCachedResult: vi.fn(async () => {}),
}));
vi.mock("@/app/lib/analytics/persist", () => ({
  appendAnalyticsEntry: vi.fn(),
}));
vi.mock("./costs", () => ({
  computeCost: vi.fn(() => 0),
}));

beforeEach(() => {
  constructorCalls.length = 0;
  messagesCreate.mockClear();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

describe("callLlm Anthropic client lifetime", () => {
  it("constructs a fresh Anthropic client per call (no singleton)", async () => {
    const { callLlm } = await import("./callLlm");

    process.env.ANTHROPIC_API_KEY = "key-A";
    await callLlm({ endpoint: "t1", systemPrompt: "s", userContent: "u", maxTokens: 10 });

    process.env.ANTHROPIC_API_KEY = "key-B";
    await callLlm({ endpoint: "t2", systemPrompt: "s", userContent: "u", maxTokens: 10 });

    // Each call must have constructed its own client with the env-var-current key.
    // If a singleton sneaks back, the second call would reuse key-A.
    expect(constructorCalls).toEqual([{ apiKey: "key-A" }, { apiKey: "key-B" }]);
  });
});
