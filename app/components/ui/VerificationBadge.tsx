import type { VerificationStatus } from "@/app/lib/types/session";

export default function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === "none") return null;
  if (status === "verifying") {
    return <span className="ml-2 text-xs font-normal text-[#6B6560]">Verifying...</span>;
  }
  if (status === "valid") {
    return <span className="ml-2 text-xs font-normal text-green-700">Verified</span>;
  }
  return <span className="ml-2 text-xs font-normal text-red-700">Verification Failed</span>;
}
