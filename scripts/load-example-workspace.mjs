#!/usr/bin/env node

/**
 * Load the example workspace into the dev server's localStorage.
 *
 * Usage:
 *   node scripts/load-example-workspace.mjs
 *
 * This script:
 * 1. Reads docs/example-workspace.json
 * 2. Starts a headless browser (via Puppeteer if available, otherwise prints
 *    a JS snippet you can paste into the browser console)
 * 3. Writes the workspace-v2 and workspace-sessions-v1 keys to localStorage
 *
 * The example workspace contains pre-generated results for every artifact type
 * so the app can be demonstrated without a valid API key.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplePath = resolve(__dirname, "..", "docs", "example-workspace.json");

const raw = readFileSync(examplePath, "utf-8");
const data = JSON.parse(raw);

// The workspace-sessions-v1 entry has a placeholder for the workspace data;
// replace it with the real workspace-v2 data so both are consistent.
const workspaceData = data["workspace-v2"];
for (const session of data["workspace-sessions-v1"].sessions) {
  if (session.workspace === "__SAME_AS_WORKSPACE_V2_ABOVE__") {
    session.workspace = workspaceData;
  }
}

// Try puppeteer; if not available, fall back to printing a console snippet.
let puppeteer;
try {
  puppeteer = await import("puppeteer");
} catch {
  // Puppeteer not installed — output a console snippet instead
  console.log("Puppeteer not available. Paste the following into your browser console at http://localhost:3000:\n");
  console.log(`// --- Load example workspace ---`);
  console.log(`localStorage.setItem("workspace-v2", ${JSON.stringify(JSON.stringify(workspaceData))});`);
  console.log(`localStorage.setItem("workspace-sessions-v1", ${JSON.stringify(JSON.stringify(data["workspace-sessions-v1"]))});`);
  console.log(`location.reload();`);
  console.log(`// --- End ---`);
  process.exit(0);
}

const DEV_URL = process.env.DEV_URL || "http://localhost:3000";

console.log(`Connecting to ${DEV_URL}...`);
const browser = await puppeteer.default.launch({ headless: "new" });
const page = await browser.newPage();
await page.goto(DEV_URL, { waitUntil: "domcontentloaded" });

await page.evaluate(
  (ws, sessions) => {
    localStorage.setItem("workspace-v2", JSON.stringify(ws));
    localStorage.setItem("workspace-sessions-v1", JSON.stringify(sessions));
  },
  workspaceData,
  data["workspace-sessions-v1"],
);

console.log("Example workspace loaded. Reload the browser to see it.");
await browser.close();
