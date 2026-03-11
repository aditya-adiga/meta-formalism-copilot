"use client";

import { useState, useCallback } from "react";
import BookSpineDivider from "@/app/components/ui/BookSpineDivider";
import InputPanel from "@/app/components/panels/InputPanel";
import OutputPanel from "@/app/components/panels/OutputPanel";

type LoadingPhase = "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying" | "iterating";
type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

const MAX_LEAN_ATTEMPTS = 3;

async function generateLean(informalProof: string, previousAttempt?: string, errors?: string, instruction?: string) {
  const res = await fetch("/api/formalization/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ informalProof, previousAttempt, errors, instruction }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Lean generation failed");
  return data.leanCode as string;
}

async function verifyLean(leanCode: string) {
  const res = await fetch("/api/verification/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leanCode }),
  });
  const data = await res.json();
  return { valid: Boolean(data.valid), errors: (data.errors as string | undefined) ?? "" };
}

export default function Home() {
  const [sourceText, setSourceText] = useState("");
  const [contextText, setContextText] = useState("");
  const [semiformalText, setSemiformalText] = useState("");
  const [leanCode, setLeanCode] = useState("");
  const [semiformalDirty, setSemiformalDirty] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("none");
  const [verificationErrors, setVerificationErrors] = useState("");

  const handleSemiformalTextChange = useCallback((text: string) => {
    setSemiformalText(text);
    setSemiformalDirty((prev) => prev || leanCode !== "");
  }, [leanCode]);

  const handleFormalise = useCallback(async () => {
    setLoadingPhase("semiformal");
    setSemiformalText("");
    setLeanCode("");
    setSemiformalDirty(false);
    setVerificationStatus("none");
    setVerificationErrors("");

    try {
      // Step 1: Generate semiformal proof
      const semiformalRes = await fetch("/api/formalization/semiformal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText }),
      });
      const semiformalData = await semiformalRes.json();
      if (!semiformalRes.ok) {
        setSemiformalText(`Error: ${semiformalData.error ?? "Unknown error"}`);
        return;
      }
      const proof = semiformalData.proof as string;
      setSemiformalText(proof);

      // Steps 2–4: Generate Lean4 with up to MAX_LEAN_ATTEMPTS retries
      setLoadingPhase("lean");
      let currentCode = "";
      let lastErrors = "";

      for (let attempt = 1; attempt <= MAX_LEAN_ATTEMPTS; attempt++) {
        // Generate (first attempt has no previous context)
        if (attempt > 1) {
          setLoadingPhase("retrying");
        }
        currentCode = await generateLean(
          proof,
          attempt > 1 ? currentCode : undefined,
          attempt > 1 ? lastErrors : undefined,
        );
        setLeanCode(currentCode);

        // Verify
        setLoadingPhase(attempt > 1 ? "reverifying" : "verifying");
        setVerificationStatus("verifying");
        const { valid, errors } = await verifyLean(currentCode);

        if (valid) {
          setVerificationStatus("valid");
          setVerificationErrors("");
          return;
        }

        lastErrors = errors || "Verification failed";
        setVerificationErrors(lastErrors);

        if (attempt === MAX_LEAN_ATTEMPTS) {
          setVerificationStatus("invalid");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      // Show error in whichever pane was being filled
      if (!semiformalText) setSemiformalText(`Error: ${msg}`);
      else if (!leanCode) setLeanCode(`-- Error: ${msg}`);
      else { setVerificationStatus("invalid"); setVerificationErrors(msg); }
    } finally {
      setLoadingPhase("idle");
    }
  }, [sourceText, semiformalText, leanCode]);

  /** Re-run verification on whatever Lean code is currently in the box. */
  const handleReVerify = useCallback(async () => {
    if (!leanCode) return;
    setLoadingPhase("verifying");
    setVerificationStatus("verifying");
    setVerificationErrors("");
    try {
      const { valid, errors } = await verifyLean(leanCode);
      setVerificationStatus(valid ? "valid" : "invalid");
      setVerificationErrors(valid ? "" : errors || "Verification failed");
    } catch (err) {
      setVerificationStatus("invalid");
      setVerificationErrors(err instanceof Error ? err.message : "Verification request failed");
    } finally {
      setLoadingPhase("idle");
    }
  }, [leanCode]);

  /** LLM-guided iteration: regenerate Lean code with an optional instruction, then re-verify. */
  const handleLeanIterate = useCallback(async (instruction: string) => {
    if (!semiformalText) return;
    setSemiformalDirty(false);
    setLoadingPhase("iterating");
    setVerificationStatus("verifying");
    setVerificationErrors("");
    try {
      const newCode = await generateLean(semiformalText, leanCode || undefined, verificationErrors || undefined, instruction || undefined);
      setLeanCode(newCode);
      const { valid, errors } = await verifyLean(newCode);
      setVerificationStatus(valid ? "valid" : "invalid");
      setVerificationErrors(valid ? "" : errors || "Verification failed");
    } catch (err) {
      setVerificationStatus("invalid");
      setVerificationErrors(err instanceof Error ? err.message : "Iteration failed");
    } finally {
      setLoadingPhase("idle");
    }
  }, [semiformalText, leanCode, verificationErrors]);

  const handleRegenerateLean = useCallback(() => {
    handleLeanIterate("");
  }, [handleLeanIterate]);

  return (
    <main className="relative grid h-screen grid-cols-2 gap-px overflow-hidden bg-[var(--ivory-cream)]">
      <section className="flex flex-col overflow-hidden shadow-sm" aria-label="Input panel">
        <InputPanel
          sourceText={sourceText}
          onSourceTextChange={setSourceText}
          contextText={contextText}
          onContextTextChange={setContextText}
          onFormalise={handleFormalise}
          loading={loadingPhase !== "idle"}
        />
      </section>
      <section className="flex flex-col overflow-hidden shadow-sm" aria-label="Output panel">
        <OutputPanel
          semiformalText={semiformalText}
          onSemiformalTextChange={handleSemiformalTextChange}
          semiformalDirty={semiformalDirty}
          onRegenerateLean={handleRegenerateLean}
          leanCode={leanCode}
          onLeanCodeChange={setLeanCode}
          loadingPhase={loadingPhase}
          verificationStatus={verificationStatus}
          verificationErrors={verificationErrors}
          onReVerify={handleReVerify}
          onLeanIterate={handleLeanIterate}
        />
      </section>
      <BookSpineDivider />
    </main>
  );
}
