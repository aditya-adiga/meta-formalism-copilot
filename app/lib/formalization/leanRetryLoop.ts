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

    if (onToken) {
      currentCode = await generateLeanStreaming(
        semiformal,
        attempt > 1 ? currentCode : undefined,
        attempt > 1 ? lastErrors : undefined,
        undefined,
        dependencyContext || undefined,
        onToken,
      );
    } else {
      currentCode = await generateLean(
        semiformal,
        attempt > 1 ? currentCode : undefined,
        attempt > 1 ? lastErrors : undefined,
        undefined,
        dependencyContext || undefined,
      );
    }
    onLeanCode(currentCode);

    if (isCancelled?.()) {
      return { valid: false, code: currentCode, errors: "" };
    }

    onVerifyStart?.(attempt);

    const fullCode = dependencyContext ? `${dependencyContext}\n\n${currentCode}` : currentCode;
    const { valid, errors } = await verifyLean(fullCode);

    if (valid) {
      onErrors("");
      return { valid: true, code: currentCode, errors: "" };
    }

    lastErrors = errors || "Verification failed";
    onErrors(lastErrors);
  }

  return { valid: false, code: currentCode, errors: lastErrors };
}
