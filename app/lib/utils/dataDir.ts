import { join } from "path";

/**
 * Resolve a writable directory for server-side persistence (analytics, LLM
 * cache, etc.).
 *
 * On Vercel Functions only `/tmp` is writable. `/tmp` lives only as long as
 * a warm container, so persistence does not survive cold starts; it is also
 * per-instance, so concurrent Function instances each see their own
 * independent contents (no cross-instance sharing). In dev and self-hosted
 * deployments we write to the repo's `data/` dir for durable cross-restart
 * storage.
 */
export function dataDir(): string {
  return process.env.VERCEL ? "/tmp" : join(process.cwd(), "data");
}
