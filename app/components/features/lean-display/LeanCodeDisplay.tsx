"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import SendIcon from "@/app/components/ui/icons/SendIcon";

type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

type LeanCodeDisplayProps = {
  code: string;
  verificationStatus: VerificationStatus;
  verificationErrors: string;
  onCodeChange: (code: string) => void;
  onReVerify: () => void;
  onIterate: (instruction: string) => void;
  iterating: boolean;
};

export default function LeanCodeDisplay({
  code,
  verificationStatus,
  verificationErrors,
  onCodeChange,
  onReVerify,
  onIterate,
  iterating,
}: LeanCodeDisplayProps) {
  const [editMode, setEditMode] = useState<"rendered" | "raw">("rendered");
  // Track which version of `code` our localCode was initialised from
  const [syncedCode, setSyncedCode] = useState(code);
  const [localCode, setLocalCode] = useState(code);
  const [instruction, setInstruction] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When the parent pushes a new code value, reset local state during render
  // (avoids calling setState inside a useEffect, which triggers cascading renders)
  if (code !== syncedCode) {
    setSyncedCode(code);
    setLocalCode(code);
    setEditMode("rendered");
  }

  // Focus textarea on entering edit mode
  useEffect(() => {
    if (editMode === "raw") textareaRef.current?.focus();
  }, [editMode]);

  const handleDoneEditing = useCallback(() => {
    onCodeChange(localCode);
    setEditMode("rendered");
  }, [localCode, onCodeChange]);

  const handleIterateSubmit = useCallback(() => {
    if (!instruction.trim() || iterating) return;
    onIterate(instruction.trim());
    setInstruction("");
  }, [instruction, iterating, onIterate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleIterateSubmit();
    }
  }, [handleIterateSubmit]);

  const canReVerify = !iterating && verificationStatus !== "verifying";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Code area */}
      <div className="relative flex-1 overflow-auto px-8 py-6">
        {/* Edit / Done toggle */}
        {code && (
          <button
            onClick={editMode === "rendered" ? () => setEditMode("raw") : handleDoneEditing}
            className="absolute right-4 top-4 z-30 rounded-md border border-[#DDD9D5] bg-[var(--ivory-cream)] px-3 py-1 text-xs text-[#6B6560] shadow-sm transition-shadow hover:shadow-md hover:text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"
          >
            {editMode === "rendered" ? "Edit" : "Done"}
          </button>
        )}

        {editMode === "rendered" ? (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-[var(--ink-black)]">
            {code}
          </pre>
        ) : (
          <textarea
            ref={textareaRef}
            value={localCode}
            onChange={(e) => setLocalCode(e.target.value)}
            className="min-h-full w-full resize-none border-0 bg-transparent font-mono text-sm leading-relaxed text-[var(--ink-black)] focus:outline-none focus:ring-0"
            style={{ caretColor: "#000000" }}
            aria-label="Lean4 code"
            spellCheck={false}
          />
        )}

        {/* Verification errors */}
        {verificationStatus === "invalid" && verificationErrors && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-red-800">
                Verification Errors
              </h3>
              <button
                onClick={onReVerify}
                disabled={!canReVerify}
                className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                Re-verify
              </button>
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-red-700">
              {verificationErrors}
            </pre>
          </div>
        )}
      </div>

      {/* Iterate bar — visible whenever there is code */}
      {code && (
        <div className="shrink-0 border-t border-[#DDD9D5] px-4 py-3">
          <div className={`flex items-center gap-2 rounded-full bg-[var(--ink-black)] px-4 py-2.5 shadow-md ${iterating ? "opacity-60" : ""}`}>
            <input
              type="text"
              value={iterating ? "" : instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={iterating ? "Iterating…" : "Suggest a fix or instruction…"}
              disabled={iterating}
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/60 focus:outline-none disabled:cursor-not-allowed"
              aria-label="Lean4 iteration instruction"
            />
            <button
              type="button"
              onClick={handleIterateSubmit}
              disabled={iterating || !instruction.trim()}
              className="flex shrink-0 items-center justify-center rounded-full p-1 text-white/90 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[var(--ink-black)] disabled:opacity-40"
              aria-label="Submit iteration instruction"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
