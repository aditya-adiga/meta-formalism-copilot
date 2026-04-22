"use client";

import { useState, useRef, useEffect } from "react";
import type { FormalizationSession } from "@/app/lib/types/session";

type SessionBannerProps = {
  currentSession: FormalizationSession;
  sessions: FormalizationSession[];
  onSelectSession: (id: string) => void;
};

function scopeLabel(session: FormalizationSession): string {
  return session.scope.type === "global"
    ? "Global"
    : session.scope.nodeLabel;
}

function statusDot(status: FormalizationSession["verificationStatus"]) {
  if (status === "valid") return <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-600" />;
  if (status === "invalid") return <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-600" />;
  if (status === "verifying") return <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#9A9590]" />;
}

export default function SessionBanner({ currentSession, sessions, onSelectSession }: SessionBannerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const hasMultiple = sessions.length > 1;
  const label = `${scopeLabel(currentSession)} — Run #${currentSession.runNumber}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => hasMultiple && setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border border-[#DDD9D5] bg-[#F5F1ED] px-3 py-1 text-xs text-[var(--ink-black)] transition-colors ${
          hasMultiple ? "cursor-pointer hover:bg-[#EBE7E3]" : "cursor-default"
        }`}
      >
        {statusDot(currentSession.verificationStatus)}
        <span>{label}</span>
        {hasMultiple && (
          <svg
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] max-h-[50vh] overflow-y-auto rounded-md border border-[#DDD9D5] bg-white py-1 shadow-md">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelectSession(s.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#F5F1ED] ${
                s.id === currentSession.id ? "font-semibold" : ""
              }`}
            >
              {statusDot(s.verificationStatus)}
              <span>{scopeLabel(s)} — Run #{s.runNumber}</span>
              <span className="ml-auto text-[#9A9590]">
                {new Date(s.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
