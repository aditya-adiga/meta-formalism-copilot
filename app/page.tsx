"use client";

import { useState, useCallback } from "react";
import BookSpineDivider from "@/app/components/ui/BookSpineDivider";
import InputPanel from "@/app/components/panels/InputPanel";
import OutputPanel from "@/app/components/panels/OutputPanel";

type LoadingPhase = "idle" | "semiformal" | "lean" | "verifying" | "retrying" | "reverifying";
type VerificationStatus = "none" | "verifying" | "valid" | "invalid";

export default function Home() {
  const [sourceText, setSourceText] = useState("");
  const [contextText, setContextText] = useState("");
  const [semiformalText, setSemiformalText] = useState("");
  const [leanCode, setLeanCode] = useState("");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("none");
  const [verificationErrors, setVerificationErrors] = useState("");

  const handleFormalise = useCallback(async () => {
    setLoadingPhase("semiformal");
    setSemiformalText("");
    setLeanCode("");
    setVerificationStatus("none");
    setVerificationErrors("");

    let gotSemiformal = false;
    let gotLean = false;
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

      const proof = semiformalData.proof;
      setSemiformalText(proof);
      gotSemiformal = true;

      // Step 2: Convert to Lean4 code
      setLoadingPhase("lean");
      const leanRes = await fetch("/api/formalization/lean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ informalProof: proof }),
      });
      const leanData = await leanRes.json();

      if (!leanRes.ok) {
        setLeanCode(`-- Error: ${leanData.error ?? "Unknown error"}`);
        return;
      }

      let currentLeanCode = leanData.leanCode;
      setLeanCode(currentLeanCode);
      gotLean = true;

      // Step 3: Verify the Lean4 code
      setLoadingPhase("verifying");
      setVerificationStatus("verifying");
      const verifyRes = await fetch("/api/verification/lean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leanCode: currentLeanCode }),
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.ok && verifyData.valid) {
        setVerificationStatus("valid");
        return;
      }

      // Verification failed — try once more
      const firstErrors = verifyData.errors ?? "Unknown verification error";
      setVerificationErrors(firstErrors);

      // Step 4: Retry Lean4 generation with error context
      setLoadingPhase("retrying");
      const retryRes = await fetch("/api/formalization/lean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          informalProof: proof,
          previousAttempt: currentLeanCode,
          errors: firstErrors,
        }),
      });
      const retryData = await retryRes.json();

      if (!retryRes.ok) {
        setVerificationStatus("invalid");
        return;
      }

      currentLeanCode = retryData.leanCode;
      setLeanCode(currentLeanCode);

      // Step 5: Re-verify the retried code
      setLoadingPhase("reverifying");
      setVerificationStatus("verifying");
      const reVerifyRes = await fetch("/api/verification/lean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leanCode: currentLeanCode }),
      });
      const reVerifyData = await reVerifyRes.json();

      if (reVerifyRes.ok && reVerifyData.valid) {
        setVerificationStatus("valid");
        setVerificationErrors("");
      } else {
        setVerificationStatus("invalid");
        setVerificationErrors(reVerifyData.errors ?? "Unknown verification error");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      if (!gotSemiformal) {
        setSemiformalText(`Error: ${msg}`);
      } else if (!gotLean) {
        setLeanCode(`-- Error: ${msg}`);
      } else {
        setVerificationStatus("invalid");
        setVerificationErrors(msg);
      }
    } finally {
      setLoadingPhase("idle");
    }
  }, [sourceText]);

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
          onSemiformalTextChange={setSemiformalText}
          leanCode={leanCode}
          loadingPhase={loadingPhase}
          verificationStatus={verificationStatus}
          verificationErrors={verificationErrors}
        />
      </section>
      <BookSpineDivider />
    </main>
  );
}
