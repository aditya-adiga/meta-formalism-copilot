import express, { Request, Response } from "express";
import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import path from "path";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3100;

// __dirname at runtime is verifier/dist/ (after tsc compiles server.ts → dist/server.js).
// The lean project lives at verifier/../lean-project, i.e. two directories up from dist/.
// An explicit env var overrides this for alternative deployment layouts.
const LEAN_PROJECT_DIR =
  process.env.LEAN_PROJECT_DIR ??
  path.resolve(__dirname, "../../lean-project");
const VERIFY_FILE = path.join(LEAN_PROJECT_DIR, "Verify.lean");

const BUILD_TIMEOUT_MS = 30_000;
const MAX_QUEUE_LENGTH = 3;

// ------------------------------------------------------------------
// Simple mutex with bounded queue.
// lake build writes to a shared file (Verify.lean) so all calls must
// be serialised to prevent races.
// ------------------------------------------------------------------
let buildRunning = false;
const buildQueue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

async function acquireBuildLock(): Promise<void> {
  if (!buildRunning) {
    buildRunning = true;
    return;
  }
  if (buildQueue.length >= MAX_QUEUE_LENGTH) {
    throw new Error("Build queue full — too many concurrent verification requests");
  }
  return new Promise<void>((resolve, reject) => {
    buildQueue.push({ resolve, reject });
  });
}

function releaseBuildLock(): void {
  const nextJob = buildQueue.shift();
  if (nextJob) {
    nextJob.resolve();
  } else {
    buildRunning = false;
  }
}

// ------------------------------------------------------------------
// Pre-process Lean code before verification.
// When combining dependency context with newly generated code, `import Mathlib`
// can appear multiple times. Lean rejects duplicate imports, so we keep only
// the first occurrence.
// ------------------------------------------------------------------

function deduplicateImports(code: string): string {
  const lines = code.split("\n");
  const seenImports = new Set<string>();
  const result = lines.filter((line) => {
    const trimmed = line.trim();
    if (/^import\s+/.test(trimmed)) {
      if (seenImports.has(trimmed)) return false;
      seenImports.add(trimmed);
    }
    return true;
  });
  return result.join("\n");
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    leanProjectDir: LEAN_PROJECT_DIR,
    queueLength: buildQueue.length,
    buildRunning,
  });
});

app.post("/verify", async (req: Request, res: Response) => {
  const { leanCode } = req.body as { leanCode?: unknown };

  if (!leanCode || typeof leanCode !== "string") {
    res.status(400).json({ error: "leanCode is required and must be a string" });
    return;
  }

  try {
    await acquireBuildLock();
  } catch (queueError) {
    const message = queueError instanceof Error ? queueError.message : "Queue full";
    res.status(503).json({ error: message });
    return;
  }

  try {
    await writeFile(VERIFY_FILE, deduplicateImports(leanCode as string), "utf-8");

    const buildResult = await runLakeBuild();

    if (buildResult.errors) {
      res.json({ valid: buildResult.valid, errors: buildResult.errors });
    } else {
      res.json({ valid: buildResult.valid });
    }
  } catch (serverError) {
    const message = serverError instanceof Error ? serverError.message : String(serverError);
    res.status(500).json({ error: message });
  } finally {
    releaseBuildLock();
  }
});

// ------------------------------------------------------------------
// lake build helper
// ------------------------------------------------------------------

interface BuildResult {
  valid: boolean;
  errors?: string;
}

function runLakeBuild(): Promise<BuildResult> {
  return new Promise<BuildResult>((resolve) => {
    execFile(
      "lake",
      ["build"],
      {
        cwd: LEAN_PROJECT_DIR,
        timeout: BUILD_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
      (execError, stdout, stderr) => {
        if (!execError) {
          resolve({ valid: true });
          return;
        }

        // Lean outputs diagnostics to stderr; stdout may carry additional context.
        const errorOutput = [stderr, stdout]
          .map((output) => output.trim())
          .filter(Boolean)
          .join("\n");

        resolve({
          valid: false,
          errors: errorOutput || `lake build exited with code ${execError.code}`,
        });
      },
    );
  });
}

// ------------------------------------------------------------------
// Start server
// ------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Lean verifier listening on port ${PORT}`);
  console.log(`  Lean project dir: ${LEAN_PROJECT_DIR}`);
  console.log(`  Verify file:      ${VERIFY_FILE}`);
});
