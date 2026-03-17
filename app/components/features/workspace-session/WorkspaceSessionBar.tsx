"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { WorkspaceSession } from "@/app/lib/types/workspaceSession";

type WorkspaceSessionBarProps = {
  sessions: WorkspaceSession[];
  activeSession: WorkspaceSession | null;
  onNewSession: () => void;
  onSwitchSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onDeleteSession: (id: string) => void;
  /** If true, an RPC is in flight and session switching should be guarded */
  isBusy: boolean;
};

export default function WorkspaceSessionBar({
  sessions,
  activeSession,
  onNewSession,
  onSwitchSession,
  onRenameSession,
  onDeleteSession,
  isBusy,
}: WorkspaceSessionBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [busyWarning, setBusyWarning] = useState<{ action: "new" | "switch"; targetId?: string } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Focus input when editing
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = useCallback(() => {
    if (!activeSession) return;
    setEditValue(activeSession.title);
    setEditing(true);
  }, [activeSession]);

  const commitEdit = useCallback(() => {
    if (!activeSession || !editValue.trim()) {
      setEditing(false);
      return;
    }
    onRenameSession(activeSession.id, editValue.trim());
    setEditing(false);
  }, [activeSession, editValue, onRenameSession]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  }, [commitEdit]);

  /** Guard action behind busy warning if RPCs are in flight */
  const guardedAction = useCallback((action: "new" | "switch", targetId?: string) => {
    if (isBusy) {
      setBusyWarning({ action, targetId });
      return;
    }
    if (action === "new") onNewSession();
    else if (targetId) onSwitchSession(targetId);
    setDropdownOpen(false);
  }, [isBusy, onNewSession, onSwitchSession]);

  const confirmBusyAction = useCallback(() => {
    if (!busyWarning) return;
    if (busyWarning.action === "new") onNewSession();
    else if (busyWarning.targetId) onSwitchSession(busyWarning.targetId);
    setBusyWarning(null);
    setDropdownOpen(false);
  }, [busyWarning, onNewSession, onSwitchSession]);

  const title = activeSession?.title ?? "No Session";

  return (
    <>
      <div
        ref={dropdownRef}
        className="relative flex items-center gap-2 border-b border-[#DDD9D5] bg-[#F5F1ED] px-3 py-1.5"
        style={{ fontFamily: "var(--font-serif, 'EB Garamond', serif)" }}
      >
        {/* Session title (editable) */}
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded border border-[#DDD9D5] bg-white px-2 py-0.5 text-sm text-[var(--ink-black)] outline-none focus:border-[#9A9590]"
          />
        ) : (
          <button
            onClick={startEditing}
            className="min-w-0 flex-1 truncate text-left text-sm text-[var(--ink-black)] hover:underline"
            title="Click to rename session"
          >
            {title}
          </button>
        )}

        {/* Dropdown toggle */}
        {sessions.length > 0 && (
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex shrink-0 items-center justify-center rounded p-1 text-[#6B6560] hover:bg-[#EBE7E3] hover:text-[var(--ink-black)] transition-colors"
            aria-label="Switch session"
          >
            <svg
              className={`h-4 w-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* New session button */}
        <button
          onClick={() => guardedAction("new")}
          className="flex shrink-0 items-center gap-1 rounded border border-[#DDD9D5] bg-white px-2 py-0.5 text-xs text-[#6B6560] hover:bg-[#EBE7E3] hover:text-[var(--ink-black)] transition-colors"
          title="New session"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 2v8M2 6h8" />
          </svg>
          <span>New</span>
        </button>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-0.5 w-full min-w-[280px] rounded-b-md border border-t-0 border-[#DDD9D5] bg-white py-1 shadow-md">
            {sessions.map((s) => {
              const isActive = s.id === activeSession?.id;
              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#F5F1ED] ${isActive ? "font-semibold bg-[#F5F1ED]/50" : ""}`}
                >
                  <button
                    onClick={() => {
                      if (!isActive) guardedAction("switch", s.id);
                      else setDropdownOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {s.title}
                  </button>
                  <span className="shrink-0 text-[10px] text-[#9A9590]">
                    {new Date(s.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${s.title}"?`)) {
                        onDeleteSession(s.id);
                      }
                    }}
                    className="shrink-0 rounded p-0.5 text-[#9A9590] hover:text-red-600 transition-colors"
                    title="Delete session"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Busy warning modal */}
      {busyWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30">
          <div className="mx-4 max-w-sm rounded-lg border border-[#DDD9D5] bg-white p-4 shadow-xl" style={{ fontFamily: "var(--font-serif, 'EB Garamond', serif)" }}>
            <p className="mb-3 text-sm text-[var(--ink-black)]">
              A formalization is currently in progress. Switching sessions now may cause results to be lost or misattributed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBusyWarning(null)}
                className="rounded border border-[#DDD9D5] px-3 py-1 text-xs text-[#6B6560] hover:bg-[#F5F1ED] transition-colors"
              >
                Wait
              </button>
              <button
                onClick={confirmBusyAction}
                className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 transition-colors"
              >
                Switch Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
