"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { FormalizationSession, SessionScope, SessionsState } from "@/app/lib/types/session";

export type SessionRestoreHandler = (session: FormalizationSession) => void;

type SessionUpdatableFields = Partial<Pick<FormalizationSession, "semiformalText" | "leanCode" | "verificationStatus" | "verificationErrors">>;


const STORAGE_KEY = "metaformalism-sessions";

function loadFromStorage(): SessionsState {
  if (typeof window === "undefined") return { sessions: [], activeSessionId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SessionsState;
  } catch {
    // Ignore parse errors
  }
  return { sessions: [], activeSessionId: null };
}

function scopeMatches(a: SessionScope, b: SessionScope): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "global") return true;
  return a.type === "node" && b.type === "node" && a.nodeId === b.nodeId;
}

export function useFormalizationSessions(onRestore?: SessionRestoreHandler) {
  const [state, setState] = useState<SessionsState>(loadFromStorage);
  const mounted = useRef(false);

  // Ref so selectAndRestore always sees the latest callback without recreating
  const onRestoreRef = useRef(onRestore);
  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);


  // Persist to localStorage on every change after initial mount
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const createSession = useCallback((scope: SessionScope): FormalizationSession => {
    const newSession: FormalizationSession = {
      id: crypto.randomUUID(),
      runNumber: 0, // will be set below
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scope,
      semiformalText: "",
      leanCode: "",
      verificationStatus: "none",
      verificationErrors: "",
      artifacts: [],
    };

    let runNumber = 1;
    setState((prev) => {
      const existing = prev.sessions.filter((s) => scopeMatches(s.scope, scope));
      runNumber = existing.length + 1;
      const session = { ...newSession, runNumber };
      return {
        sessions: [...prev.sessions, session],
        activeSessionId: session.id,
      };
    });

    // Return session with correct runNumber for immediate use
    // We compute it eagerly from state to avoid stale closure issues
    newSession.runNumber = runNumber;
    return newSession;
  }, []);

  const updateSession = useCallback((id: string, updates: SessionUpdatableFields) => {
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === id
          ? { ...s, ...updates, updatedAt: new Date().toISOString() }
          : s
      ),
    }));
  }, []);

  const selectSession = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeSessionId: id }));
  }, []);

  /**
   * Select a session and restore its state into the workspace.
   * Calls the onRestore callback (provided at hook init) with the session data
   * so the caller can apply it to global or per-node state.
   */
  const selectAndRestore = useCallback((sessionId: string) => {
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    setState((prev) => ({ ...prev, activeSessionId: sessionId }));
    onRestoreRef.current?.(session);
  }, [state.sessions]);

  /**
   * Mirror an update to the active session (if one exists).
   * Consolidates the scattered `if (activeSession) updateSession(...)` pattern.
   */
  const syncToActiveSession = useCallback((updates: SessionUpdatableFields) => {
    setState((prev) => {
      if (!prev.activeSessionId) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === prev.activeSessionId
            ? { ...s, ...updates, updatedAt: new Date().toISOString() }
            : s
        ),
      };
    });
  }, []);


  const clearActiveSession = useCallback(() => {
    setState((prev) => ({ ...prev, activeSessionId: null }));
  }, []);

  const sessionsForScope = useCallback((scope: SessionScope): FormalizationSession[] => {
    return state.sessions
      .filter((s) => scopeMatches(s.scope, scope))
      .sort((a, b) => b.runNumber - a.runNumber);
  }, [state.sessions]);

  const activeSession: FormalizationSession | null =
    state.sessions.find((s) => s.id === state.activeSessionId) ?? null;

  const activeSessionForScope = useCallback((scope: SessionScope): FormalizationSession | null => {
    if (!activeSession) return null;
    return scopeMatches(activeSession.scope, scope) ? activeSession : null;
  }, [activeSession]);

  // All sessions sorted by run number (descending), for use in session banners
  const allSessionsSorted = useMemo(() =>
    [...state.sessions].sort((a, b) => b.runNumber - a.runNumber || b.updatedAt.localeCompare(a.updatedAt)),
    [state.sessions],
  );

  return {
    sessions: state.sessions,
    allSessionsSorted,
    activeSession,
    createSession,
    updateSession,
    selectSession,
    selectAndRestore,
    syncToActiveSession,
    clearActiveSession,
    sessionsForScope,
    activeSessionForScope,
  };
}
