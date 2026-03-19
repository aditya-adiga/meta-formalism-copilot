"use client";

import { useState, useCallback, useRef } from "react";
import { generateSemiformalStreaming, generateLeanStreaming, verifyLean } from "@/app/lib/formalization/api";
import { leanRetryLoop } from "@/app/lib/formalization/leanRetryLoop";
import { throttle } from "@/app/lib/utils/throttle";
import type { LoadingPhase, VerificationStatus } from "@/app/lib/types/session";

export type { LoadingPhase, VerificationStatus };

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
      const onToken = throttle((accumulated: string) => {
        acc.current.setSemiformal(accumulated);
      }, 50);

      const proof = await generateSemiformalStreaming(inputText, undefined, onToken);
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

      const onToken = throttle((accumulated: string) => {
        acc.current.setLeanCode(accumulated);
      }, 50);

      const result = await leanRetryLoop(semiformal, {
        onLeanCode: (code) => {
          onToken.cancel();
          a.setLeanCode(code);
          a.onSessionUpdate?.({ leanCode: code });
        },
        onErrors: (errors) => {
          a.setVerificationErrors(errors);
          a.onSessionUpdate?.({ verificationErrors: errors });
        },
        onAttemptStart: (attempt) => {
          if (attempt > 1) setLoadingPhase("retrying");
        },
        onVerifyStart: (attempt) => {
          setLoadingPhase(attempt > 1 ? "reverifying" : "verifying");
          a.setVerificationStatus("verifying");
          a.onSessionUpdate?.({ verificationStatus: "verifying" });
        },
        dependencyContext: depContext || undefined,
        onToken,
      });

      const vStatus = result.valid ? "valid" as const : "invalid" as const;
      a.setVerificationStatus(vStatus);
      if (result.valid) a.setVerificationErrors("");
      a.onSessionUpdate?.({ verificationStatus: vStatus, verificationErrors: result.valid ? "" : result.errors });
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

  /** Prepend dependency context, verify, and apply result to state */
  const verifyWithDeps = useCallback(async (a: PipelineAccessors, code: string) => {
    const depContext = a.getDependencyContext?.();
    const fullCode = depContext ? `${depContext}\n\n${code}` : code;
    const { valid, errors } = await verifyLean(fullCode);
    const vStatus = valid ? "valid" as const : "invalid" as const;
    const vErrors = valid ? "" : errors || "Verification failed";
    a.setVerificationStatus(vStatus);
    a.setVerificationErrors(vErrors);
    a.onSessionUpdate?.({ verificationStatus: vStatus, verificationErrors: vErrors });
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
      await verifyWithDeps(a, code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification request failed";
      a.setVerificationStatus("invalid");
      a.setVerificationErrors(msg);
      a.onSessionUpdate?.({ verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [verifyWithDeps]);

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

      const onToken = throttle((accumulated: string) => {
        acc.current.setLeanCode(accumulated);
      }, 50);

      const newCode = await generateLeanStreaming(
        semiformal,
        onToken,
        currentLean || undefined,
        currentErrors || undefined,
        instruction || undefined,
        depContext || undefined,
        onToken,
      );

      a.setLeanCode(newCode);
      a.onSessionUpdate?.({ leanCode: newCode });

      await verifyWithDeps(a, newCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Iteration failed";
      a.setVerificationStatus("invalid");
      a.setVerificationErrors(msg);
      a.onSessionUpdate?.({ verificationStatus: "invalid", verificationErrors: msg });
    } finally {
      setLoadingPhase("idle");
    }
  }, [verifyWithDeps]);

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
