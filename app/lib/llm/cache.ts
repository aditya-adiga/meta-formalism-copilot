import { createHash } from "crypto";
import { readFile, writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import type { LlmCallUsage } from "./callLlm";

const CACHE_DIR = join(process.cwd(), "data", "cache");

type CachedResult = {
  text: string;
  usage: LlmCallUsage;
};

type CachedResultWithHash = CachedResult & { cacheHash: string };

export function computeHash(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): string {
  return createHash("sha256")
    .update(JSON.stringify({ model, systemPrompt, userContent, maxTokens }))
    .digest("hex");
}

let dirEnsured = false;
async function ensureCacheDir() {
  if (dirEnsured) return;
  await mkdir(CACHE_DIR, { recursive: true });
  dirEnsured = true;
}

export async function getCachedResult(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): Promise<CachedResultWithHash | null> {
  const hash = computeHash(model, systemPrompt, userContent, maxTokens);
  const filePath = join(CACHE_DIR, `${hash}.json`);

  try {
    const data = JSON.parse(await readFile(filePath, "utf-8")) as CachedResult;
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
    // Corrupt or missing cache file — treat as miss
    return null;
  }
}

export async function setCachedResult(
  hash: string,
  result: CachedResult
): Promise<void> {
  await ensureCacheDir();
  const filePath = join(CACHE_DIR, `${hash}.json`);
  await writeFile(filePath, JSON.stringify(result, null, 2), "utf-8");
}

export async function removeCachedResult(
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
): Promise<void> {
  const hash = computeHash(model, systemPrompt, userContent, maxTokens);
  const filePath = join(CACHE_DIR, `${hash}.json`);
  try {
    await unlink(filePath);
  } catch {
    // File doesn't exist — nothing to remove
  }
}
