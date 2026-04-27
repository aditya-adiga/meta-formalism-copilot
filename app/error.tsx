"use client";

import { useEffect } from "react";

/**
 * App-level error boundary. Catches rendering crashes in any panel and
 * provides a recovery UI instead of a white screen (React error #418 etc).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--ivory-cream)] px-6 text-center"
      style={{ fontFamily: "var(--font-serif, 'EB Garamond', serif)" }}
    >
      <h2 className="text-xl font-semibold text-[var(--ink-black)]">
        Something went wrong
      </h2>
      <p className="max-w-md text-sm text-[#6B6560]">
        An unexpected error occurred. Your workspace data is saved and should be
        intact after recovery.
      </p>
      <button
        onClick={reset}
        className="rounded-full border border-[var(--ink-black)] bg-transparent px-6 py-2.5 text-sm font-medium text-[var(--ink-black)] shadow-sm transition-all duration-200 hover:bg-[var(--ink-black)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--ink-black)] focus:ring-offset-2 focus:ring-offset-[var(--ivory-cream)]"
      >
        Try again
      </button>
    </main>
  );
}
