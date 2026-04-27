import { join } from "path";

/**
 * Resolve a writable directory for server-side persistence (analytics, LLM
 * cache, etc.).
 *
 * On Vercel Functions only `/tmp` is writable, and it lives only as long as
 * the warm container — so persistence does not survive cold starts. In dev
 * and self-hosted deployments we write to the repo's `data/` dir for durable
 * cross-restart storage.
 */
export function dataDir(...subpaths: string[]): string {
  const base = process.env.VERCEL ? "/tmp" : join(process.cwd(), "data");
  return subpaths.length > 0 ? join(base, ...subpaths) : base;
}
