import type { VerificationStatus } from "@/app/lib/types/session";

export default function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "none") return null;
  if (status === "verifying") {
    return <span className="ml-2 text-xs font-normal text-[#6B6560]">Checking...</span>;
  }
  if (status === "valid") {
    return <span className="ml-2 text-xs font-normal text-green-700">Passed</span>;
  }
  if (status === "unavailable") {
    return (
      <span
        className="ml-2 text-xs font-normal text-amber-700"
        title="Lean verifier is offline or not configured. Set LEAN_VERIFIER_URL to enable checking."
      >
        Verifier offline — not checked
      </span>
    );
  }
  return <span className="ml-2 text-xs font-normal text-red-700">Check Failed</span>;
}
