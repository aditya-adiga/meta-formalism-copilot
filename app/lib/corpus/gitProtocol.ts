/**
 * Worker request/response protocol for the git pipeline (DD-009 sub-task S3).
 *
 * The git worker (gitWorker.ts) and the main-thread proxy (gitWorkerClient.ts)
 * communicate via `postMessage` with these typed messages. The contract that makes
 * DD-009 §Failure-driven ("silent fallback disallowed") real is:
 *
 *   - EVERY response is the discriminated `{ ok:true, result } | { ok:false, error }`.
 *   - `error` is a `CorpusWorkerError` (structured-clone-safe), produced by
 *     `toWorkerError`. No untyped throw and no class instance ever crosses the
 *     boundary — the proxy reconstructs a typed `CorpusError` from it.
 *
 * `handleGitRequest` is a PLAIN function (not the worker itself) so CI can test the
 * dispatch + reification without a real `Worker` (jsdom has none) — the worker is a
 * 10-line shell that just forwards messages to this function (arch-review F2/F5).
 */

import type {
  CorpusGit,
  CorpusWorkerError,
  GitCommitResult,
  GitLogOptions,
  GitLogPage,
  GitStatusEntry,
} from "./types";
import { CorpusError, toWorkerError } from "./types";

// --- Requests (main thread -> worker) --------------------------------------
// `id` correlates a response to its request so concurrent calls don't cross.
export type GitRequest =
  | { id: number; type: "init" }
  | { id: number; type: "commit"; message: string }
  | { id: number; type: "log"; options?: GitLogOptions }
  | { id: number; type: "status" }
  | { id: number; type: "push" }
  | { id: number; type: "pull" };

/** Maps each request `type` to its success-result shape. */
export interface GitResultMap {
  init: void;
  commit: GitCommitResult;
  log: GitLogPage;
  status: GitStatusEntry[];
  push: void;
  pull: void;
}

// --- Responses (worker -> main thread) -------------------------------------
export type GitResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: CorpusWorkerError };

/**
 * Dispatch a request against a `CorpusGit` implementation, reifying ANY throw
 * into a `CorpusWorkerError`. Resolves (never rejects) so the worker can always
 * `postMessage` a well-formed `GitResponse` — a rejection here would become an
 * unhandled rejection in the worker, exactly the silent failure DD-009 forbids.
 *
 * `core` is the git logic (gitCore.ts in the real worker); injected so this is
 * unit-testable with a stub.
 */
export async function handleGitRequest(core: CorpusGit, req: GitRequest): Promise<GitResponse> {
  try {
    let result: unknown;
    switch (req.type) {
      case "init":
        result = await core.init();
        break;
      case "commit":
        result = await core.commit(req.message);
        break;
      case "log":
        result = await core.log(req.options);
        break;
      case "status":
        result = await core.status();
        break;
      case "push":
        result = await core.push();
        break;
      case "pull":
        result = await core.pull();
        break;
      default: {
        // Exhaustiveness: an unknown request type is itself a typed failure, not
        // a silent no-op.
        const _exhaustive: never = req;
        throw new CorpusError({
          kind: "io",
          path: "(git-worker)",
          reason: `unknown git request: ${JSON.stringify(_exhaustive)}`,
        });
      }
    }
    return { id: req.id, ok: true, result };
  } catch (e) {
    // Reify EVERY throw — typed or not — so nothing untyped crosses postMessage.
    const corpusErr =
      e instanceof CorpusError
        ? e
        : new CorpusError({ kind: "io", path: "(git-worker)", reason: (e as Error)?.message ?? String(e) });
    return { id: req.id, ok: false, error: toWorkerError(corpusErr) };
  }
}
