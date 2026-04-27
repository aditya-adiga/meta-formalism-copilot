import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { AnalyticsEntry } from "@/app/lib/types/analytics";
import { dataDir } from "@/app/lib/utils/dataDir";

// On Vercel, analytics history doesn't persist across cold starts — see
// Deploy to Vercel in README. See dataDir() for the underlying rationale.
const DATA_DIR = dataDir();
const FILE_PATH = join(DATA_DIR, "analytics.jsonl");

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function appendAnalyticsEntry(entry: AnalyticsEntry): void {
  ensureDir();
  appendFileSync(FILE_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

export function readAnalyticsEntries(): AnalyticsEntry[] {
  if (!existsSync(FILE_PATH)) return [];
  const content = readFileSync(FILE_PATH, "utf-8");
  const entries: AnalyticsEntry[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip corrupt lines
    }
  }
  return entries;
}

export function clearAnalyticsEntries(): void {
  ensureDir();
  writeFileSync(FILE_PATH, "", "utf-8");
}
