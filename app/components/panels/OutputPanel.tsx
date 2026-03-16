"use client";

import { useCallback, useEffect, useState } from "react";
import EditableOutput from "@/app/components/features/output-editing/EditableOutput";
import WholeTextEditBar from "@/app/components/features/output-editing/ai-bars/WholeTextEditBar";
import LeanCodeDisplay from "@/app/components/features/lean-display/LeanCodeDisplay";
import VerificationBadge from "@/app/components/ui/VerificationBadge";
import type { VerificationStatus } from "@/app/lib/types/session";
import type { WaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";
import { useWaitTimeEstimate } from "@/app/hooks/useWaitTimeEstimate";

type OutputPanelProps = {
  semiformalText: string;
  onSemiformalTextChange: (value: string) => void;
  semiformalDirty: boolean;
  onRegenerateLean: () => void;
  leanCode: string;
  onLeanCodeChange: (code: string) => void;
  loadingPhase: "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying" | "iterating";
  verificationStatus: VerificationStatus;
  verificationErrors: string;
  onReVerify: () => void;
  onLeanIterate: (instruction: string) => void;
  waitEstimate?: WaitTimeEstimate | null;
};

export default function OutputPanel({ semiformalText, onSemiformalTextChange, semiformalDirty, onRegenerateLean, leanCode, onLeanCodeChange, loadingPhase, verificationStatus, verificationErrors, onReVerify, onLeanIterate, waitEstimate }: OutputPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editEndpoint, setEditEndpoint] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");

  const editWaitEstimate = useWaitTimeEstimate(editEndpoint, semiformalText.length);

  // Switch back to rendered view when new semiformal content arrives, but not while user is editing (raw mode).
  // renderMode intentionally omitted from deps to avoid re-triggering on mode change.
  useEffect(() => {
    if (semiformalText && renderMode !== "raw") setRenderMode("rendered");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semiformalText]);

  const handleToggleEdit = useCallback(() => {
    setRenderMode((m) => (m === "rendered" ? "raw" : "rendered"));
  }, []);

  const handleInlineEdit = useCallback(async (instruction: string, selection: { start: number; end: number; text: string }) => {
    setEditing(true);
    setEditEndpoint("edit/inline");
    try {
      const response = await fetch("/api/edit/inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullText: semiformalText, selection, instruction }),
      });
      const data = await response.json();
      if (response.ok) {
        const newText = semiformalText.slice(0, selection.start) + data.text + semiformalText.slice(selection.end);
        onSemiformalTextChange(newText);
        setRenderMode("rendered");
      } else {
        console.error("[inline edit]", data.error);
      }
    } catch (err) {
      console.error("[inline edit]", err);
    } finally {
      setEditing(false);
      setEditEndpoint(null);
    }
  }, [semiformalText, onSemiformalTextChange]);

  const handleWholeTextEdit = useCallback(async (instruction: string) => {
    setEditing(true);
    setEditEndpoint("edit/whole");
    try {
      const response = await fetch("/api/edit/whole", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullText: semiformalText, instruction }),
      });
      const data = await response.json();
      if (response.ok) {
        onSemiformalTextChange(data.text);
        setRenderMode("rendered");
      } else {
        console.error("[whole edit]", data.error);
      }
    } catch (err) {
      console.error("[whole edit]", err);
    } finally {
      setEditing(false);
      setEditEndpoint(null);
    }
  }, [semiformalText, onSemiformalTextChange]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {editing && (
        <div className="absolute inset-x-0 top-0 z-40 overflow-hidden bg-[var(--ink-black)] px-4 py-1.5 text-center text-xs text-white/90">
          {editWaitEstimate && (
            <span
              className="absolute inset-y-0 left-0 bg-white/15 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round(editWaitEstimate.progress * 100)}%` }}
            />
          )}
          <span className="relative">
            Applying edit...{editWaitEstimate ? ` ${editWaitEstimate.remainingLabel}` : ""}
          </span>
        </div>
      )}

      {/* Semiformal proof section — editable */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Semiformal Proof
          </h2>
          {loadingPhase === "semiformal" && waitEstimate && (
            <span className="text-xs text-[#6B6560]">
              Generating... {waitEstimate.remainingLabel}
            </span>
          )}
        </div>
        <EditableOutput
          value={semiformalText}
          onChange={onSemiformalTextChange}
          onInlineEdit={handleInlineEdit}
          renderMode={renderMode}
          onToggleEdit={handleToggleEdit}
        />
        {/* Floating bar anchored to the bottom of this section */}
        {semiformalText && !editing && <WholeTextEditBar onApply={handleWholeTextEdit} />}
      </div>

      {/* Lean4 code section */}
      {(leanCode || loadingPhase === "lean" || loadingPhase === "verifying" || loadingPhase === "retrying" || loadingPhase === "reverifying" || loadingPhase === "iterating") && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t-2 border-[var(--ink-black)]">
          <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
              Lean4 Code
            </h2>
            <div className="flex items-center gap-2">
              <VerificationBadge status={verificationStatus} />
              {(loadingPhase === "lean" || loadingPhase === "retrying" || loadingPhase === "iterating") && waitEstimate && (
                <span className="text-xs text-[#6B6560]">{waitEstimate.remainingLabel}</span>
              )}
              {verificationStatus === "invalid" && loadingPhase === "idle" && (
                <button
                  onClick={() => onLeanIterate("")}
                  className="text-xs font-medium text-red-700 border border-red-300 bg-red-50 rounded-md px-2.5 py-1 hover:bg-red-100 transition-colors focus:outline-none focus:ring-1 focus:ring-red-400"
                >
                  Verification failed — Fix with AI
                </button>
              )}
              {semiformalDirty && loadingPhase === "idle" && (
                <button
                  onClick={onRegenerateLean}
                  className="text-xs font-medium text-amber-700 border border-amber-300 bg-amber-50 rounded-md px-2.5 py-1 hover:bg-amber-100 transition-colors focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  Semiformal changed — Regenerate
                </button>
              )}
            </div>
          </div>
          {loadingPhase === "lean" && !leanCode ? (
            <div className="flex-1 px-8 py-10 text-sm text-[#6B6560]">
              Generating Lean4 code...{waitEstimate ? ` ${waitEstimate.remainingLabel}` : ""}
            </div>
          ) : (
            <LeanCodeDisplay
              code={leanCode}
              verificationStatus={verificationStatus}
              verificationErrors={verificationErrors}
              onCodeChange={onLeanCodeChange}
              onReVerify={onReVerify}
              onIterate={onLeanIterate}
              iterating={loadingPhase === "iterating" || loadingPhase === "verifying" || loadingPhase === "reverifying"}
            />
          )}
        </div>
      )}

    </div>
  );
}
