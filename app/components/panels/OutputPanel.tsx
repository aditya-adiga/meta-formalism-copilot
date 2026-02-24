"use client";

import { useCallback, useEffect, useState } from "react";
import EditableOutput from "@/app/components/features/output-editing/EditableOutput";
import WholeTextEditBar from "@/app/components/features/output-editing/ai-bars/WholeTextEditBar";
import LeanCodeDisplay from "@/app/components/features/lean-display/LeanCodeDisplay";

type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

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
};

function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "none") return null;
  if (status === "verifying") {
    return <span className="ml-2 text-xs font-normal text-[#6B6560]">Verifying...</span>;
  }
  if (status === "valid") {
    return <span className="ml-2 text-xs font-normal text-green-700">Verified</span>;
  }
  return <span className="ml-2 text-xs font-normal text-red-700">Verification Failed</span>;
}

export default function OutputPanel({ semiformalText, onSemiformalTextChange, semiformalDirty, onRegenerateLean, leanCode, onLeanCodeChange, loadingPhase, verificationStatus, verificationErrors, onReVerify, onLeanIterate }: OutputPanelProps) {
  const [editing, setEditing] = useState(false);
  const [renderMode, setRenderMode] = useState<"rendered" | "raw">("rendered");

  // Switch back to rendered view whenever new semiformal content arrives
  useEffect(() => {
    if (semiformalText) setRenderMode("rendered");
  }, [semiformalText]);

  const handleToggleEdit = useCallback(() => {
    setRenderMode((m) => (m === "rendered" ? "raw" : "rendered"));
  }, []);

  const handleInlineEdit = useCallback(async (instruction: string, selection: { start: number; end: number; text: string }) => {
    setEditing(true);
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
    }
  }, [semiformalText, onSemiformalTextChange]);

  const handleWholeTextEdit = useCallback(async (instruction: string) => {
    setEditing(true);
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
    }
  }, [semiformalText, onSemiformalTextChange]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {editing && (
        <div className="absolute inset-x-0 top-0 z-40 bg-[var(--ink-black)] px-4 py-1.5 text-center text-xs text-white/90">
          Applying edit...
        </div>
      )}

      {/* Semiformal proof section — editable */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Semiformal Proof
          </h2>
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
              <VerificationBadge status={verificationStatus} />
            </h2>
            {semiformalDirty && loadingPhase === "idle" && (
              <button
                onClick={onRegenerateLean}
                className="text-xs font-medium text-amber-700 border border-amber-300 bg-amber-50 rounded-md px-2.5 py-1 hover:bg-amber-100 transition-colors focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                Semiformal changed — Regenerate ↺
              </button>
            )}
          </div>
          {loadingPhase === "lean" && !leanCode ? (
            <div className="flex-1 px-8 py-10 text-sm text-[#6B6560]">
              Generating Lean4 code...
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
