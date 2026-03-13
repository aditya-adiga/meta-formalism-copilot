import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import type { LlmCallUsage } from "./callLlm";

const CACHE_DIR = join(process.cwd(), "data", "cache");

type CachedResult = {
  text: string;
  usage: LlmCallUsage;
};

type CachedResultWithHash = CachedResult & { cacheHash: string };

function computeHash(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): string {
  return createHash("sha256")
    .update(JSON.stringify({ model, systemPrompt, userContent, maxTokens }))
    .digest("hex");
}

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function getCachedResult(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): CachedResultWithHash | null {
  const hash = computeHash(model, systemPrompt, userContent, maxTokens);
  const filePath = join(CACHE_DIR, `${hash}.json`);

  if (!existsSync(filePath)) return null;

  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as CachedResult;
    // Override usage to reflect cache hit
    return {
      text: data.text,
      usage: {
        ...data.usage,
        provider: "cache",
        costUsd: 0,
        latencyMs: 0,
      },
      cacheHash: hash,
    };
  } catch {
    // Corrupt cache file — treat as miss
    return null;
  }
}

export function setCachedResult(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  result: CachedResult
): void {
  ensureCacheDir();
  const hash = computeHash(model, systemPrompt, userContent, maxTokens);
  const filePath = join(CACHE_DIR, `${hash}.json`);
  writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
}

export function removeCachedResult(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
): void {
  const hash = computeHash(model, systemPrompt, userContent, maxTokens);
  const filePath = join(CACHE_DIR, `${hash}.json`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
