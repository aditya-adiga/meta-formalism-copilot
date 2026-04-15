"use client";

import { useState, useCallback, useSyncExternalStore } from "react";

const ONBOARDING_SEEN_KEY = "mfc-onboarding-seen";

// Tiny external store so we can read localStorage without hydration mismatch.
let _onboardingVisible: boolean | null = null;
const _onboardingListeners = new Set<() => void>();

function getOnboardingSnapshot(): boolean {
  if (_onboardingVisible === null) {
    _onboardingVisible = !localStorage.getItem(ONBOARDING_SEEN_KEY);
  }
  return _onboardingVisible;
}

function getOnboardingServerSnapshot(): boolean {
  return false;
}

function subscribeOnboarding(cb: () => void): () => void {
  _onboardingListeners.add(cb);
  return () => _onboardingListeners.delete(cb);
}

function setOnboardingVisible(v: boolean): void {
  _onboardingVisible = v;
  for (const cb of _onboardingListeners) cb();
}

type OnboardingStep = {
  title: string;
  content: React.ReactNode;
  icon: React.ReactNode;
};

const steps: OnboardingStep[] = [
  {
    title: "Welcome to Meta-Formalism Copilot",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="20" />
        <path d="M24 14v10l7 7" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>
          This tool helps you <strong>formalize</strong> natural-language arguments, proofs, and claims into structured, machine-verifiable artifacts.
        </p>
        <p>
          Whether you are working with mathematical proofs, causal models, or philosophical arguments, the copilot guides your reasoning into rigorous forms.
        </p>
      </div>
    ),
  },
  {
    title: "Step 1: Provide Source Material",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 6h16l8 8v24a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
        <polyline points="29 6 29 14 38 14" />
        <line x1="18" y1="22" x2="34" y2="22" />
        <line x1="18" y1="28" x2="34" y2="28" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>
          Start in the <strong>Source Input</strong> panel. You can:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Type or paste text directly</li>
          <li>Upload files (.txt, .md, .tex, .docx, .pdf)</li>
          <li>LaTeX files with theorem environments are parsed automatically</li>
        </ul>
        <p className="text-sm text-[#6B6560]">
          Optionally set a <strong>context</strong> description (e.g., &quot;category theory&quot;) to help the AI tailor its output.
        </p>
      </div>
    ),
  },
  {
    title: "Step 2: Choose Artifact Types",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="20" width="12" height="12" rx="2" />
        <rect x="30" y="20" width="12" height="12" rx="2" />
        <rect x="18" y="8" width="12" height="12" rx="2" />
        <rect x="18" y="32" width="12" height="12" rx="2" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>
          Select one or more artifact types to generate:
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-[#DDD9D5] px-2 py-1"><strong>Deductive (Lean)</strong> &mdash; semiformal proof + Lean 4 code</div>
          <div className="rounded border border-[#DDD9D5] px-2 py-1"><strong>Causal Graph</strong> &mdash; variables &amp; causal relationships</div>
          <div className="rounded border border-[#DDD9D5] px-2 py-1"><strong>Statistical Model</strong> &mdash; hypotheses &amp; tests</div>
          <div className="rounded border border-[#DDD9D5] px-2 py-1"><strong>Property Tests</strong> &mdash; invariants &amp; test specs</div>
          <div className="rounded border border-[#DDD9D5] px-2 py-1"><strong>Balanced Perspectives</strong> &mdash; multi-perspective arguments</div>
          <div className="rounded border border-[#DDD9D5] px-2 py-1"><strong>Counterexamples</strong> &mdash; adversarial scenarios</div>
        </div>
        <p>
          Then click <strong>Formalise</strong> to generate.
        </p>
      </div>
    ),
  },
  {
    title: "Step 3: Decompose Longer Texts",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="10" r="5" />
        <circle cx="12" cy="34" r="5" />
        <circle cx="36" cy="34" r="5" />
        <line x1="24" y1="15" x2="12" y2="29" />
        <line x1="24" y1="15" x2="36" y2="29" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>
          For multi-part arguments or papers, use <strong>Decompose</strong> to extract individual propositions into a dependency graph.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nodes represent propositions (definitions, lemmas, theorems)</li>
          <li>Edges show dependency relationships</li>
          <li>Click a node to inspect and formalize it individually</li>
          <li>Use <strong>Formalize All</strong> to batch-process nodes in dependency order</li>
        </ul>
      </div>
    ),
  },
  {
    title: "Step 4: Review & Iterate",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M34 6L42 14L14 42H6V34L34 6Z" />
        <line x1="28" y1="12" x2="36" y2="20" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>
          Review generated artifacts in their respective panels. For the <strong>deductive pipeline</strong>:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Edit the semiformal proof (raw mode) or use <strong>Cmd/Ctrl+K</strong> for inline AI edits</li>
          <li>Generate Lean 4 code and verify it against a Lean 4 service</li>
          <li>Use <strong>Fix with AI</strong> or <strong>Explain this error</strong> when verification fails</li>
        </ul>
        <p>
          Other artifact panels support inline editing and AI-assisted refinement via the editing bar at the bottom.
        </p>
      </div>
    ),
  },
  {
    title: "Step 5: Sessions & Export",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 6v20M14 18l10 8 10-8" />
        <path d="M6 30v8a2 2 0 002 2h32a2 2 0 002-2v-8" />
      </svg>
    ),
    content: (
      <div className="space-y-3">
        <p>
          Your work is <strong>automatically saved</strong> to browser storage and persists across refreshes.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Workspace sessions</strong> &mdash; manage multiple projects from the top bar</li>
          <li><strong>Formalization sessions</strong> &mdash; switch between past runs via the session banner</li>
          <li><strong>Export All</strong> &mdash; download everything as a .zip (Markdown, Lean, JSON, PNG)</li>
        </ul>
        <p className="text-sm text-[#6B6560]">
          You can reopen this guide anytime using the <strong>?</strong> button in the sidebar.
        </p>
      </div>
    ),
  },
];

type OnboardingOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export default function OnboardingOverlay({ open, onClose }: OnboardingOverlayProps) {
  // Early return before hooks — when closed, unmount so state resets on next open
  if (!open) return null;

  return <OnboardingOverlayInner onClose={onClose} />;
}

function OnboardingOverlayInner({ onClose }: { onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onClose();
    }
  }, [currentStep, onClose]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Getting started guide"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 w-full max-w-xl rounded-lg border border-[#DDD9D5] bg-[var(--ivory-cream)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-[#DDD9D5] px-6 pt-6 pb-4">
          <span className="shrink-0 text-[var(--ink-black)] opacity-70">
            {step.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-[var(--ink-black)]">
              {step.title}
            </h2>
          </div>
          <button
            onClick={handleSkip}
            className="shrink-0 rounded p-1 text-[#6B6560] hover:bg-[var(--rail-hover)] hover:text-[var(--ink-black)] transition-colors"
            aria-label="Close guide"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 text-[15px] leading-relaxed text-[var(--ink-black)]">
          {step.content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#DDD9D5] px-6 py-4">
          {/* Step indicator dots */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentStep
                    ? "bg-[var(--ink-black)]"
                    : "bg-[#DDD9D5] hover:bg-[#9A9590]"
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-2">
            {!isFirst && (
              <button
                onClick={handleBack}
                className="rounded border border-[#DDD9D5] px-4 py-1.5 text-sm font-medium text-[#6B6560] hover:border-[var(--ink-black)] hover:text-[var(--ink-black)] transition-colors"
              >
                Back
              </button>
            )}
            {!isLast && (
              <button
                onClick={handleSkip}
                className="rounded px-4 py-1.5 text-sm text-[#6B6560] hover:text-[var(--ink-black)] transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              className="rounded bg-[var(--ink-black)] px-4 py-1.5 text-sm font-medium text-[var(--ivory-cream)] hover:opacity-90 transition-opacity"
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hook to manage onboarding visibility state */
export function useOnboarding() {
  // useSyncExternalStore with a server snapshot avoids hydration mismatch
  // (React error #418): server always returns false, client reads localStorage.
  const showOnboarding = useSyncExternalStore(
    subscribeOnboarding, getOnboardingSnapshot, getOnboardingServerSnapshot,
  );

  const closeOnboarding = useCallback(() => {
    setOnboardingVisible(false);
    localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
  }, []);

  const openOnboarding = useCallback(() => {
    setOnboardingVisible(true);
  }, []);

  return { showOnboarding, closeOnboarding, openOnboarding };
}
