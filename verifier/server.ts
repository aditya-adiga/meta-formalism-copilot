import express, { Request, Response } from "express";
import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import path from "path";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3100;
const LEAN_PROJECT_DIR = path.resolve(__dirname, "../lean-project");
const VERIFY_FILE = path.join(LEAN_PROJECT_DIR, "Verify.lean");
const BUILD_TIMEOUT_MS = 30_000;
const MAX_QUEUE = 3;

// Simple mutex with bounded queue
let running = false;
const queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

async function acquireLock(): Promise<void> {
  if (!running) {
    running = true;
    return;
  }
  if (queue.length >= MAX_QUEUE) {
    throw new Error("Queue full");
  }
  return new Promise<void>((resolve, reject) => {
    queue.push({ resolve, reject });
  });
}

function releaseLock(): void {
  const next = queue.shift();
  if (next) {
    next.resolve();
  } else {
    running = false;
  }
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.post("/verify", async (req: Request, res: Response) => {
  const { leanCode } = req.body;

  if (!leanCode || typeof leanCode !== "string") {
    res.status(400).json({ error: "leanCode is required and must be a string" });
    return;
  }

  try {
    await acquireLock();
  } catch {
    res.status(503).json({ error: "Server busy, try again later" });
    return;
  }

  try {
    await writeFile(VERIFY_FILE, leanCode, "utf-8");

    const { valid, errors } = await new Promise<{
      valid: boolean;
      errors?: string;
    }>((resolve) => {
      const ac = new AbortController();
      execFile(
        "lake",
        ["build"],
        {
          cwd: LEAN_PROJECT_DIR,
          timeout: BUILD_TIMEOUT_MS,
          signal: ac.signal,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ valid: true });
          } else {
            const combined = [stderr, stdout].filter(Boolean).join("\n").trim();
            resolve({
              valid: false,
              errors: combined || `lake build exited with code ${error.code}`,
            });
          }
        },
      );
    });

    if (errors) {
      res.json({ valid, errors });
    } else {
      res.json({ valid });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  } finally {
    releaseLock();
  }
});

app.listen(PORT, () => {
  console.log(`Lean verifier listening on port ${PORT}`);
});
