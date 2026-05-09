import { generateLean, generateLeanStreaming, verifyLean } from "./api";

export const MAX_LEAN_ATTEMPTS = 3;

export type LeanRetryCallbacks = {
  /** Called with each new Lean code attempt */
  onLeanCode: (code: string) => void;
  /** Called when verification errors occur */
  onErrors: (errors: string) => void;
  /** Called on each attempt start (attempt >= 2 means retry) */
  onAttemptStart?: (attempt: number) => void;
  /** Called before verification starts */
  onVerifyStart?: (attempt: number) => void;
  /** Optional: check if execution should be cancelled */
  isCancelled?: () => boolean;
  /** Optional: Lean dependency context to prepend for verification */
  dependencyContext?: string;
  /** Called with accumulated text as tokens stream in */
  onToken?: (accumulated: string) => void;
};

export type LeanRetryResult = {
  valid: boolean;
  code: string;
  errors: string;
  /** True when the verifier was unavailable — the proof was generated but never checked. */
  unavailable?: boolean;
};

/**
 * Generate Lean code from a semiformal proof and verify it,
 * retrying up to MAX_LEAN_ATTEMPTS times on failure.
 */
export async function leanRetryLoop(
  semiformal: string,
  callbacks: LeanRetryCallbacks,
): Promise<LeanRetryResult> {
  const { onLeanCode, onErrors, onAttemptStart, onVerifyStart, isCancelled, dependencyContext, onToken } = callbacks;

  let currentCode = "";
  let lastErrors = "";

  for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
    if (isCancelled?.()) {
      return { valid: false, code: currentCode, errors: "" };
    }

    onAttemptStart?.(attempt);

    const isRetry = attempt > 1;
    const args = [
      semiformal,
      isRetry ? currentCode : undefined,
      isRetry ? lastErrors : undefined,
      undefined,
      dependencyContext || undefined,
    ] as const;

    currentCode = onToken
      ? await generateLeanStreaming(...args, onToken)
      : await generateLean(...args);
    onLeanCode(currentCode);

    if (isCancelled?.()) {
      return { valid: false, code: currentCode, errors: "" };
    }

    onVerifyStart?.(attempt);

    const fullCode = dependencyContext ? `${dependencyContext}\n\n${currentCode}` : currentCode;
    const { valid, errors, unavailable } = await verifyLean(fullCode);

    if (unavailable) {
      // No point retrying — the proof was never actually checked.
      onErrors("");
      return { valid: false, code: currentCode, errors: "", unavailable: true };
    }

    if (valid) {
      onErrors("");
      return { valid: true, code: currentCode, errors: "" };
    }

    lastErrors = errors || "Verification failed";
    onErrors(lastErrors);
  }

  return { valid: false, code: currentCode, errors: lastErrors };
}
