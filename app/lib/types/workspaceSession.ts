import type { PersistedWorkspace } from "./persistence";
import type { SessionsState } from "./session";

export const WORKSPACE_SESSIONS_KEY = "workspace-sessions-v1";

export type WorkspaceSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspace: PersistedWorkspace;
  formalizationSessions: SessionsState;
};

export type WorkspaceSessionsState = {
  sessions: WorkspaceSession[];
  activeSessionId: string | null;
};

/** Generate a default title from source text or uploaded filenames */
export function generateSessionTitle(
  sourceText: string,
  extractedFiles: { name: string }[],
): string {
  // Prefer first line of source text
  if (sourceText.trim()) {
    const firstLine = sourceText.trim().split("\n")[0];
    return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;
  }
  // Fall back to uploaded filenames
  if (extractedFiles.length > 0) {
    const names = extractedFiles.map((f) => f.name).join(", ");
    return names.length > 80 ? names.slice(0, 77) + "..." : names;
  }
  return "Untitled Session";
}
