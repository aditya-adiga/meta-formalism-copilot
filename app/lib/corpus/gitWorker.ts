/**
 * Dedicated Web Worker entry for the git pipeline (DD-009 sub-task S3).
 *
 * iso-git's SHA1/zlib CPU bursts run HERE, off the main thread (DD-009 §Decision).
 * This file is intentionally THIN (arch-review F2): it constructs a `gitCore` over
 * an OPFS-backed `gitFs` + iso-git's web http client and forwards every message to
 * the plain `handleGitRequest` dispatch (which is unit-tested without a Worker).
 *
 * Buffer polyfill (spike gotcha — iso-git-browser-smoke.md): iso-git references
 * `globalThis.Buffer`. We polyfill it in WORKER SCOPE only, so the main bundle
 * never carries the polyfill (arch-review F6: iso-git is contained to worker-side
 * files). A worker has its own global, so this assignment doesn't leak.
 *
 * NOT imported by jsdom/CI — the worker + real OPFS are exercised only by the
 * out-of-CI smoke (docs/spikes/corpus-git-smoke.md). The named module is
 * `gitWorker.ts` (NOT a reserved Next.js App Router filename like page/route/layout).
 *
 * This module is bundled as a Web Worker via `new Worker(new URL("./gitWorker.ts",
 * import.meta.url))` from the (future S4/S5) composition root.
 */

// `self` is the worker global scope. Declared loosely so this file does not need
// the WebWorker lib in the project-wide tsconfig.
declare const self: {
  Buffer?: unknown;
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
};

import { Buffer } from "buffer";
import * as git from "isomorphic-git";
// iso-git's browser http client. Imported only in worker scope.
import http from "isomorphic-git/http/web";
import { createGitCore } from "./gitCore";
import { createGitFs } from "./gitFs";
import { createOpfsCorpusFs } from "./opfsAdapter";
import { handleGitRequest } from "./gitProtocol";
import type { GitRequest } from "./gitProtocol";
import type { GitCoreDeps } from "./gitCore";

// Worker-scope Buffer polyfill (see header). Must run before any iso-git call.
if (typeof self !== "undefined" && self.Buffer === undefined) {
  self.Buffer = Buffer;
}

/** Configuration the main thread passes once, before the first git request. The
 *  remote url / auth come from user settings (S5 wires the UI). */
interface GitWorkerInit {
  type: "__init__";
  remoteUrl?: string;
  author?: { name: string; email: string };
}

let core = buildCore();

function buildCore(init?: GitWorkerInit) {
  const deps: GitCoreDeps = {
    // The corpus root is the OPFS root; iso-git's dir is "" (the corpus root),
    // so `.git/` lives alongside state/ and workspaces/.
    fs: createGitFs(createOpfsCorpusFs(), ""),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- http client type differs per entry point
    http: http as any,
    dir: "",
    remoteUrl: init?.remoteUrl,
    author: init?.author,
  };
  return createGitCore(deps);
}

self.onmessage = async (ev: { data: unknown }) => {
  const msg = ev.data as GitRequest | GitWorkerInit;
  // Re-init (set remote/author) is a control message, not a git op.
  if ((msg as GitWorkerInit).type === "__init__") {
    core = buildCore(msg as GitWorkerInit);
    return;
  }
  const res = await handleGitRequest(core, msg as GitRequest);
  self.postMessage(res);
};

// Mark this module as a worker entry (no default export; side-effecting).
export {};
