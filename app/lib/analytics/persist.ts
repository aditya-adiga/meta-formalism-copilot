import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { AnalyticsEntry } from "@/app/lib/types/analytics";

// On Vercel, only /tmp is writable, and it lasts only as long as the warm
// container. Analytics history therefore doesn't persist across cold starts
// on Vercel — see Deploy to Vercel in README. In dev/self-hosted deployments
// we still write to the repo's data/ dir.
const DATA_DIR = process.env.VERCEL ? "/tmp" : join(process.cwd(), "data");
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
