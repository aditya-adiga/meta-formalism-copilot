import type { VerificationStatus } from "@/app/lib/types/session";

export default function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "none") return null;
  if (status === "verifying") {
    return <span className="ml-2 text-xs font-normal text-[#6B6560]">Verifying...</span>;
  }
  if (status === "valid") {
    return <span className="ml-2 text-xs font-normal text-green-700">Verified</span>;
  }
  if (status === "unavailable") {
    // font-medium + amber-800 so the offline state is at least as prominent as
    // "Verified" (it's an action-required state, not a low-priority hint) and
    // clears AA contrast against the panel background.
    return (
      <span
        className="ml-2 text-xs font-medium text-amber-800"
        title="Lean verifier is offline or not configured. Set LEAN_VERIFIER_URL to enable checking."
      >
        Verifier offline — not checked
      </span>
    );
  }
  return <span className="ml-2 text-xs font-normal text-red-700">Verification Failed</span>;
}
