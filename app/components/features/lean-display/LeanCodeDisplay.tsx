type LeanCodeDisplayProps = {
  code: string;
  verificationStatus?: "none" | "verifying" | "valid" | "invalid";
  verificationErrors?: string;
};

export default function LeanCodeDisplay({ code, verificationStatus, verificationErrors }: LeanCodeDisplayProps) {
  return (
    <div className="flex-1 overflow-auto px-8 py-10">
      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-[var(--ink-black)]">
        {code}
      </pre>
      {verificationStatus === "invalid" && verificationErrors && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-red-800">
            Verification Errors
          </h3>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-red-700">
            {verificationErrors}
          </pre>
        </div>
      )}
    </div>
  );
}
