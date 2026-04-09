"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { PersistedWorkspace, PersistedDecomposition } from "@/app/lib/types/persistence";
import type { SessionsState } from "@/app/lib/types/session";
import {
  WORKSPACE_SESSIONS_KEY,
  generateSessionTitle,
  type WorkspaceSession,
  type WorkspaceSessionsState,
} from "@/app/lib/types/workspaceSession";

type WorkspaceSnapshotFns = {
  getWorkspaceSnapshot: () => PersistedWorkspace;
  getSessionsSnapshot: () => SessionsState;
  resetWorkspaceToSnapshot: (data: PersistedWorkspace) => PersistedDecomposition;
  resetSessionsToSnapshot: (data: SessionsState) => void;
  clearWorkspace: () => PersistedDecomposition;
  clearAllSessions: () => void;
  resetDecomp: (data: PersistedDecomposition) => void;
  cancelQueue: () => void;
  resetQueue: () => void;
};

const DEBOUNCE_MS = 500;

function loadFromStorage(): WorkspaceSessionsState {
  if (typeof window === "undefined") return { sessions: [], activeSessionId: null };
  try {
    const raw = localStorage.getItem(WORKSPACE_SESSIONS_KEY);
    if (raw) return JSON.parse(raw) as WorkspaceSessionsState;
  } catch {
    // Ignore parse errors
  }
  return { sessions: [], activeSessionId: null };
}

function hasWorkspaceContent(ws: PersistedWorkspace): boolean {
  return Boolean(
    ws.sourceText.trim() ||
    ws.extractedFiles.length > 0 ||
    ws.semiformalText.trim() ||
    ws.leanCode.trim() ||
    ws.decomposition.nodes.length > 0,
  );
}

export function useWorkspaceSessions(fns: WorkspaceSnapshotFns) {
  const [state, setState] = useState<WorkspaceSessionsState>(loadFromStorage);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const fnsRef = useRef(fns);
  useEffect(() => { fnsRef.current = fns; }, [fns]);

  // Dirty flag: skip auto-save when workspace hasn't changed since last save
  const lastSavedSnapshotRef = useRef<string | null>(null);

  // Debounced persist
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(WORKSPACE_SESSIONS_KEY, JSON.stringify(state));
    }, DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        localStorage.setItem(WORKSPACE_SESSIONS_KEY, JSON.stringify(stateRef.current));
      }
    };
  }, []);

  // --- Migration: create initial session from existing workspace data ---
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;

    const current = stateRef.current;
    if (current.sessions.length > 0) return; // Already has sessions

    const ws = fnsRef.current.getWorkspaceSnapshot();
    if (!hasWorkspaceContent(ws)) return; // Nothing to migrate

    const sessions = fnsRef.current.getSessionsSnapshot();
    const session: WorkspaceSession = {
      id: crypto.randomUUID(),
      title: generateSessionTitle(ws.sourceText, ws.extractedFiles),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspace: ws,
      formalizationSessions: sessions,
    };

    setState({ sessions: [session], activeSessionId: session.id });
  }, []);

  /** Snapshot the current workspace into the active workspace session.
   *  Skips the save if the workspace hasn't changed since the last save
   *  (avoids structuredClone + JSON.stringify overhead when idle). */
  const saveCurrentSession = useCallback(() => {
    const activeId = stateRef.current.activeSessionId;
    if (!activeId) return;

    const ws = fnsRef.current.getWorkspaceSnapshot();
    const sessions = fnsRef.current.getSessionsSnapshot();

    // Dirty check: skip if snapshot is identical to last save
    const snapshotKey = JSON.stringify(ws);
    if (snapshotKey === lastSavedSnapshotRef.current) return;
    lastSavedSnapshotRef.current = snapshotKey;

    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === activeId
          ? {
              ...s,
              updatedAt: new Date().toISOString(),
              title: s.title === "Untitled Session"
                ? generateSessionTitle(ws.sourceText, ws.extractedFiles)
                : s.title,
              workspace: ws,
              formalizationSessions: sessions,
            }
          : s,
      ),
    }));
  }, []);

  /** Create a new empty workspace session, auto-saving the current one first */
  const createNewSession = useCallback(() => {
    // Save current session before clearing
    saveCurrentSession();

    fnsRef.current.cancelQueue();
    fnsRef.current.resetQueue();
    const decompData = fnsRef.current.clearWorkspace();
    fnsRef.current.clearAllSessions();
    fnsRef.current.resetDecomp(decompData);

    const newSession: WorkspaceSession = {
      id: crypto.randomUUID(),
      title: "Untitled Session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspace: fnsRef.current.getWorkspaceSnapshot(),
      formalizationSessions: { sessions: [], activeSessionId: null },
    };

    setState((prev) => ({
      sessions: [...prev.sessions, newSession],
      activeSessionId: newSession.id,
    }));
  }, [saveCurrentSession]);

  /** Switch to a different workspace session, auto-saving the current one first */
  const switchToSession = useCallback((targetId: string) => {
    const current = stateRef.current;
    if (current.activeSessionId === targetId) return;

    const target = current.sessions.find((s) => s.id === targetId);
    if (!target) return;

    // Save current session
    saveCurrentSession();

    // Cancel any running queue and reset progress before loading new session's data
    fnsRef.current.cancelQueue();
    fnsRef.current.resetQueue();
    const decompData = fnsRef.current.resetWorkspaceToSnapshot(target.workspace);
    fnsRef.current.resetSessionsToSnapshot(target.formalizationSessions);
    fnsRef.current.resetDecomp(decompData);

    setState((prev) => ({ ...prev, activeSessionId: targetId }));
  }, [saveCurrentSession]);

  const renameSession = useCallback((id: string, title: string) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s,
      ),
    }));
  }, []);

  const deleteSession = useCallback((id: string) => {
    setState((prev) => {
      const remaining = prev.sessions.filter((s) => s.id !== id);
      const newActiveId = prev.activeSessionId === id
        ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
        : prev.activeSessionId;

      // If we're deleting the active session, cancel queue and load the new active one (or clear)
      if (prev.activeSessionId === id) {
        fnsRef.current.cancelQueue();
        fnsRef.current.resetQueue();
        const newActive = remaining.find((s) => s.id === newActiveId);
        if (newActive) {
          const decompData = fnsRef.current.resetWorkspaceToSnapshot(newActive.workspace);
          fnsRef.current.resetSessionsToSnapshot(newActive.formalizationSessions);
          fnsRef.current.resetDecomp(decompData);
        } else {
          const decompData = fnsRef.current.clearWorkspace();
          fnsRef.current.clearAllSessions();
          fnsRef.current.resetDecomp(decompData);
        }
      }

      return { sessions: remaining, activeSessionId: newActiveId };
    });
  }, []);

  // --- Auto-save: periodically snapshot the active session ---
  // Piggybacks on a 5-second interval rather than every workspace change
  // to avoid excessive serialization
  useEffect(() => {
    const interval = setInterval(() => {
      if (stateRef.current.activeSessionId) {
        saveCurrentSession();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [saveCurrentSession]);

  const activeWorkspaceSession = useMemo(() =>
    state.sessions.find((s) => s.id === state.activeSessionId) ?? null,
    [state.sessions, state.activeSessionId],
  );

  const sortedSessions = useMemo(() =>
    [...state.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [state.sessions],
  );

  return {
    workspaceSessions: sortedSessions,
    activeWorkspaceSession,
    saveCurrentSession,
    createNewSession,
    switchToSession,
    renameSession,
    deleteSession,
  };
}
