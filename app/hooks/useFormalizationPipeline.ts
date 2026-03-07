"use client";

import { useState, useCallback, useRef } from "react";
import { generateSemiformal, generateLean, verifyLean } from "@/app/lib/formalization/api";
import type { LoadingPhase, VerificationStatus } from "@/app/lib/types/session";

export type { LoadingPhase, VerificationStatus };

const MAX_LEAN_ATTEMPTS = 3;

/**
 * Callbacks the pipeline uses to read/write state.
 * The caller provides these so the same pipeline logic works
 * for both global state and per-node state.
 */
export type PipelineAccessors = {
  getSemiformal: () => string;
  setSemiformal: (text: string) => void;
  getLeanCode: () => string;
  setLeanCode: (code: string) => void;
  setVerificationStatus: (status: VerificationStatus) => void;
  getVerificationErrors: () => string;
  setVerificationErrors: (errors: string) => void;
  /** Called before semiformal generation to reset related state */
  onResetForSemiformal?: () => void;
  /** Called before lean generation to reset related state */
  onResetForLean?: () => void;
  /** Optional: return dependency Lean context for verification */
  getDependencyContext?: () => string | undefined;
  /** Optional: mirror updates to session storage */
  onSessionUpdate?: (updates: Record<string, unknown>) => void;
};

export type FormalizationPipeline = {
  loadingPhase: LoadingPhase;
  handleGenerateSemiformal: (inputText: string) => Promise<void>;
  handleGenerateLean: () => Promise<void>;
  handleReVerify: () => Promise<void>;
  handleLeanIterate: (instruction: string) => Promise<void>;
  handleRegenerateLean: () => void;
};

/**
 * Encapsulates the semiformal → Lean → verify → retry pipeline.
 *
 * Accessors are passed via a ref so the pipeline always reads the latest
 * state without needing to re-create callbacks when accessors change.
 */
export function useFormalizationPipeline(accessors: PipelineAccessors): FormalizationPipeline {
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");

  // Keep a ref to accessors so async callbacks always see the latest version
  const acc = useRef(accessors);
  acc.current = accessors;

  const handleGenerateSemiformal = useCallback(async (inputText: string) => {
    const a = acc.current;
    a.onResetForSemiformal?.();
    a.setSemiformal("");
    a.setLeanCode("");
    a.setVerificationStatus("none");
    a.setVerificationErrors("");
    setLoadingPhase("semiformal");

    try {
      const proof = await generateSemiformal(inputText);
      a.setSemiformal(proof);
      a.onSessionUpdate?.({ semiformalText: proof });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      a.setSemiformal(`Error: ${msg}`);
    } finally {
      setLoadingPhase("idle");
    }
  }, []);

  const handleGenerateLean = useCallback(async () => {
    const a = acc.current;
    const semiformal = a.getSemiformal();
    if (!semiformal) return;

    a.onResetForLean?.();
    a.setLeanCode("");
    a.setVerificationStatus("none");
    a.setVerificationErrors("");
    setLoadingPhase("lean");

    try {
      const depContext = a.getDependencyContext?.();
      let currentCode = "";
      let lastErrors = "";

      for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
        if (attempt > 1) setLoadingPhase("retrying");
        currentCode = await generateLean(
          semiformal,
          attempt > 1 ? currentCode : undefined,
          attempt > 1 ? lastErrors : undefined,
          undefined,
          depContext || undefined,
        );
        a.setLeanCode(currentCode);
        a.onSessionUpdate?.({ leanCode: currentCode });

        setLoadingPhase(attempt > 1 ? "reverifying" : "verifying");
        a.setVerificationStatus("verifying");
        a.onSessionUpdate?.({ verificationStatus: "verifying" });

        const fullCode = depContext ? `${depContext}\n\n${currentCode}` : currentCode;
        const { valid, errors } = await verifyLean(fullCode);

        if (valid) {
          a.setVerificationStatus("valid");
          a.setVerificationErrors("");
          a.onSessionUpdate?.({ verificationStatus: "valid", verificationErrors: "" });
          return;
        }

        lastErrors = errors || "Verification failed";
        a.setVerificationErrors(lastErrors);
        a.onSessionUpdate?.({ verificationErrors: lastErrors });
        if (attempt === MAX_LEAN_ATTEMPTS) {
          a.setVerificationStatus("invalid");
          a.onSessionUpdate?.({ verificationStatus: "invalid" });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      const currentLean = a.getLeanCode();
      if (!currentLean) a.setLeanCode(`-- Error: ${msg}`);
      else { a.setVerificationStatus("invalid"); a.setVerificationErrors(msg); }
      a.onSessionUpdate?.({ verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, []);

  const handleReVerify = useCallback(async () => {
    const a = acc.current;
    const code = a.getLeanCode();
    if (!code) return;

    setLoadingPhase("verifying");
    a.setVerificationStatus("verifying");
    a.setVerificationErrors("");
    a.onSessionUpdate?.({ verificationStatus: "verifying", verificationErrors: "" });

    try {
      const depContext = a.getDependencyContext?.();
      const fullCode = depContext ? `${depContext}\n\n${code}` : code;
      const { valid, errors } = await verifyLean(fullCode);
      const vStatus = valid ? "valid" as const : "invalid" as const;
      const vErrors = valid ? "" : errors || "Verification failed";

      a.setVerificationStatus(vStatus);
      a.setVerificationErrors(vErrors);
      a.onSessionUpdate?.({ verificationStatus: vStatus, verificationErrors: vErrors });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification request failed";
      a.setVerificationStatus("invalid");
      a.setVerificationErrors(msg);
      a.onSessionUpdate?.({ verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, []);

  const handleLeanIterate = useCallback(async (instruction: string) => {
    const a = acc.current;
    const semiformal = a.getSemiformal();
    const currentLean = a.getLeanCode();
    const currentErrors = a.getVerificationErrors();
    if (!semiformal) return;

    setLoadingPhase("iterating");
    a.setVerificationStatus("verifying");
    a.setVerificationErrors("");
    a.onSessionUpdate?.({ verificationStatus: "verifying", verificationErrors: "" });

    try {
      const depContext = a.getDependencyContext?.();

      const newCode = await generateLean(
        semiformal,
        currentLean || undefined,
        currentErrors || undefined,
        instruction || undefined,
        depContext || undefined,
      );

      a.setLeanCode(newCode);
      a.onSessionUpdate?.({ leanCode: newCode });

      const fullCode = depContext ? `${depContext}\n\n${newCode}` : newCode;
      const { valid, errors } = await verifyLean(fullCode);
      const vStatus = valid ? "valid" as const : "invalid" as const;
      const vErrors = valid ? "" : errors || "Verification failed";

      a.setVerificationStatus(vStatus);
      a.setVerificationErrors(vErrors);
      a.onSessionUpdate?.({ verificationStatus: vStatus, verificationErrors: vErrors });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Iteration failed";
      a.setVerificationStatus("invalid");
      a.setVerificationErrors(msg);
      a.onSessionUpdate?.({ verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, []);

  const handleRegenerateLean = useCallback(() => {
    handleLeanIterate("");
  }, [handleLeanIterate]);

  return {
    loadingPhase,
    handleGenerateSemiformal,
    handleGenerateLean,
    handleReVerify,
    handleLeanIterate,
    handleRegenerateLean,
  };
}
