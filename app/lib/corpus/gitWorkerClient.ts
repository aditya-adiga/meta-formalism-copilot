/**
 * Main-thread `CorpusGit` proxy over a worker transport (DD-009 sub-task S3).
 *
 * This is what the main thread holds. It implements `CorpusGit` by posting typed
 * `GitRequest`s to a transport (a real `Worker` in production, a fake in tests)
 * and awaiting the correlated `GitResponse`. On a `{ok:false}` response it
 * reconstructs a `new CorpusError(detail, message)` and throws it — so callers on
 * the main thread get a typed `CorpusError` indistinguishable from the non-worker
 * path (DD-009 §Failure-driven: the typed error survives the boundary).
 *
 * The transport is INJECTED (arch-review F3): the proxy never spawns a global
 * `Worker` at import. The composition root (a client effect, never module load)
 * builds the real `Worker` and passes it in via `workerTransport()`.
 */

import { CorpusError } from "./types";
import type { CorpusGit, CorpusWorkerError, GitCommitResult, GitLogOptions, GitLogPage, GitStatusEntry } from "./types";
import type { GitRequest, GitResponse } from "./gitProtocol";

/** The minimal transport the proxy needs: post a request, subscribe to responses.
 *  A real `Worker` is adapted to this by `workerTransport()` below. */
export interface GitTransport {
  post(req: GitRequest): void;
  onMessage(cb: (res: GitResponse) => void): () => void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
}

/** Build a `CorpusGit` proxy over a transport. */
export function createGitWorkerProxy(transport: GitTransport): CorpusGit {
  let nextId = 1;
  const pending = new Map<number, Pending>();

  // A single response listener routes by id so concurrent requests never cross.
  transport.onMessage((res) => {
    const p = pending.get(res.id);
    if (!p) return; // unknown/late id — ignore (the request already settled)
    pending.delete(res.id);
    if (res.ok) {
      p.resolve(res.result);
    } else {
      p.reject(reconstruct(res.error));
    }
  });

  function reconstruct(e: CorpusWorkerError): CorpusError {
    // Rebuild the thrown form from the serializable twin (types.ts contract).
    return new CorpusError(e.detail, e.message);
  }

  // Distributive omit so each union member keeps its own discriminant fields
  // (a plain Omit<GitRequest,"id"> collapses to the common keys only).
  type RequestBody = GitRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

  function call<T>(req: RequestBody): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      transport.post({ ...req, id } as GitRequest);
    });
  }

  return {
    init: () => call<void>({ type: "init" }),
    commit: (message: string) => call<GitCommitResult>({ type: "commit", message }),
    log: (options?: GitLogOptions) => call<GitLogPage>({ type: "log", options }),
    status: () => call<GitStatusEntry[]>({ type: "status" }),
    push: () => call<void>({ type: "push" }),
    pull: () => call<void>({ type: "pull" }),
  };
}

/**
 * Adapt a real `Worker` to a `GitTransport`. Called from the composition root
 * (a client gesture/effect), never at module load — `Worker` does not exist in
 * SSR or in jsdom.
 */
export function workerTransport(worker: Worker): GitTransport {
  return {
    post(req) {
      worker.postMessage(req);
    },
    onMessage(cb) {
      const handler = (ev: MessageEvent<GitResponse>) => cb(ev.data);
      worker.addEventListener("message", handler);
      return () => worker.removeEventListener("message", handler);
    },
  };
}
