"use client";

import LeanCodeDisplay from "@/app/components/features/lean-display/LeanCodeDisplay";
import DownloadButton from "@/app/components/ui/DownloadButton";
import { downloadLeanCode } from "@/app/lib/utils/export";
import VerificationBadge from "@/app/components/ui/VerificationBadge";
import type { LoadingPhase, VerificationStatus } from "@/app/lib/types/session";

type LeanPanelProps = {
  leanCode: string;
  onLeanCodeChange: (code: string) => void;
  loadingPhase: LoadingPhase;
  verificationStatus: VerificationStatus;
  verificationErrors: string;
  semiformalDirty: boolean;
  semiformalReady?: boolean;
  onRegenerateLean: () => void;
  onReVerify: () => void;
  onLeanIterate: (instruction: string) => void;
  sessionBanner?: React.ReactNode;
};

export default function LeanPanel({
  leanCode,
  onLeanCodeChange,
  loadingPhase,
  verificationStatus,
  verificationErrors,
  semiformalDirty,
  semiformalReady,
  onRegenerateLean,
  onReVerify,
  onLeanIterate,
  sessionBanner,
}: LeanPanelProps) {
  const showLean = leanCode || loadingPhase === "lean" || loadingPhase === "verifying" || loadingPhase === "retrying" || loadingPhase === "reverifying" || loadingPhase === "iterating";

  if (!showLean) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
        <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Lean4 Code
          </h2>
          {sessionBanner}
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-[#9A9590] px-8 text-center">
          {semiformalReady
            ? "Review the semiformal proof, then generate Lean4 code from the Semiformal panel."
            : "Lean4 code will appear here after formalization."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      <div className="border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
            Lean4 Code
          </h2>
          {sessionBanner}
        </div>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {leanCode && loadingPhase === "idle" && (
            <DownloadButton
              label="Export .lean"
              onClick={() => downloadLeanCode(leanCode)}
            />
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
  );
}
