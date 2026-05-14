"use client";

import { useState, useCallback, useEffect } from "react";
import type { CustomArtifactTypeDefinition, CustomArtifactTypeId } from "@/app/lib/types/customArtifact";
import { fetchApi } from "@/app/lib/formalization/api";

type DesignerStep = "describe" | "review" | "test";

type CustomTypeDesignerProps = {
  onSave: (def: CustomArtifactTypeDefinition) => void;
  onClose: () => void;
  sourceText?: string;
  contextText?: string;
  existingDef?: CustomArtifactTypeDefinition;
};

function generateId(): CustomArtifactTypeId {
  return `custom-${crypto.randomUUID()}`;
}

export default function CustomTypeDesigner({
  onSave,
  onClose,
  sourceText,
  contextText,
  existingDef,
}: CustomTypeDesignerProps) {
  const [step, setStep] = useState<DesignerStep>(existingDef ? "review" : "describe");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<Partial<CustomArtifactTypeDefinition> | null>(
    existingDef ?? null,
  );
  const [refinement, setRefinement] = useState("");
  const [designing, setDesigning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const callDesignApi = useCallback(async (body: Record<string, unknown>) => {
    setDesigning(true);
    setError(null);
    try {
      const data = await fetchApi<{ definition: Partial<CustomArtifactTypeDefinition> }>(
        "/api/custom-type/design", body,
      );
      setDraft(data.definition);
      setRefinement("");
      return data.definition;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setDesigning(false);
    }
  }, []);

  const handleDesign = useCallback(async () => {
    const result = await callDesignApi({
      userDescription: description || undefined,
      currentDraft: draft || undefined,
      refinementInstruction: refinement || undefined,
    });
    if (result) setStep("review");
  }, [description, draft, refinement, callDesignApi]);

  const handleRefine = useCallback(async () => {
    if (!refinement.trim()) return;
    await callDesignApi({
      userDescription: description || undefined,
      currentDraft: draft,
      refinementInstruction: refinement,
    });
  }, [description, draft, refinement, callDesignApi]);

  const handleTest = useCallback(async () => {
    if (!draft?.systemPrompt || !sourceText?.trim()) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const data = await fetchApi<{ result: unknown }>("/api/formalization/custom", {
        sourceText,
        context: contextText ?? "",
        customSystemPrompt: draft.systemPrompt,
        customOutputFormat: draft.outputFormat ?? "json",
      });
      const result = data.result;
      setTestResult(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      setStep("test");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setTesting(false);
    }
  }, [draft, sourceText, contextText]);

  const handleSave = useCallback(() => {
    if (!draft?.name || !draft?.systemPrompt) return;
    const now = new Date().toISOString();
    const def: CustomArtifactTypeDefinition = {
      id: existingDef?.id ?? generateId(),
      name: draft.name,
      chipLabel: draft.chipLabel ?? draft.name.slice(0, 20),
      description: draft.description ?? "",
      whenToUse: draft.whenToUse ?? "",
      systemPrompt: draft.systemPrompt,
      outputFormat: draft.outputFormat ?? "json",
      createdAt: existingDef?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(def);
  }, [draft, existingDef, onSave]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg bg-[var(--ivory-cream)] shadow-lg border border-[#DDD9D5]">
        {/* Header — pinned */}
        <div className="shrink-0 flex items-center justify-between border-b border-[#DDD9D5] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--ink-black)]">
            {existingDef ? "Edit Custom Type" : "Design Custom Artifact Type"}
          </h2>
          <button type="button" onClick={onClose} className="text-[#9A9590] hover:text-[var(--ink-black)] text-lg cursor-pointer">
            &times;
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* Step 1: Describe */}
          {step === "describe" && (
            <>
              <p className="text-sm text-[#6B6560]">
                Describe what kind of artifact you want to create. Be specific about the analysis, output structure, and use case.
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. An ethical impact analysis that identifies stakeholders, potential harms and benefits, and suggests mitigation strategies..."
                className="w-full h-32 rounded border border-[#DDD9D5] bg-white px-3 py-2 text-sm text-[var(--ink-black)] placeholder:text-[#9A9590] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] resize-none"
              />
            </>
          )}

          {/* Step 2: Review draft */}
          {step === "review" && draft && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">Name</label>
                <input
                  type="text"
                  value={draft.name ?? ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 w-full rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-sm text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">Chip Label</label>
                <input
                  type="text"
                  value={draft.chipLabel ?? ""}
                  onChange={(e) => setDraft({ ...draft, chipLabel: e.target.value })}
                  className="mt-1 w-full rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-sm text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">Description</label>
                <textarea
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="mt-1 w-full h-16 rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-sm text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">When to Use</label>
                <textarea
                  value={draft.whenToUse ?? ""}
                  onChange={(e) => setDraft({ ...draft, whenToUse: e.target.value })}
                  className="mt-1 w-full h-12 rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-sm text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">Output Format</label>
                <select
                  value={draft.outputFormat ?? "json"}
                  onChange={(e) => setDraft({ ...draft, outputFormat: e.target.value as "json" | "text" })}
                  className="mt-1 w-full rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-sm text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"
                >
                  <option value="json">Structured JSON</option>
                  <option value="text">Free-form Text</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">System Prompt</label>
                <textarea
                  value={draft.systemPrompt ?? ""}
                  onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                  className="mt-1 w-full h-48 rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-xs font-mono text-[var(--ink-black)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)] resize-y"
                />
              </div>

              {/* Refinement input */}
              <div className="border-t border-[#DDD9D5] pt-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6560]">Refine with AI</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={refinement}
                    onChange={(e) => setRefinement(e.target.value)}
                    placeholder="e.g. Add confidence levels to each finding..."
                    onKeyDown={(e) => { if (e.key === "Enter" && refinement.trim()) handleRefine(); }}
                    className="flex-1 rounded border border-[#DDD9D5] bg-white px-3 py-1.5 text-sm text-[var(--ink-black)] placeholder:text-[#9A9590] focus:outline-none focus:ring-1 focus:ring-[var(--ink-black)]"
                  />
                  <button
                    type="button"
                    onClick={handleRefine}
                    disabled={!refinement.trim() || designing}
                    className="px-3 py-1.5 text-sm bg-[var(--ink-black)] text-[var(--ivory-cream)] rounded hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {designing ? "..." : "Refine"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Test result preview */}
          {step === "test" && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">Test Output Preview</h3>
              <pre className="rounded border border-[#DDD9D5] bg-white px-4 py-3 text-xs font-mono text-[var(--ink-black)] overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                {testResult}
              </pre>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer — pinned action buttons */}
        <div className="shrink-0 border-t border-[#DDD9D5] px-6 py-3 flex justify-between">
          {step === "describe" && (
            <>
              <div />
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#6B6560] hover:text-[var(--ink-black)] cursor-pointer">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDesign}
                  disabled={!description.trim() || designing}
                  className="px-4 py-2 text-sm bg-[var(--ink-black)] text-[var(--ivory-cream)] rounded hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {designing ? "Designing..." : "Design Type"}
                </button>
              </div>
            </>
          )}
          {step === "review" && draft && (
            <>
              <button
                type="button"
                onClick={() => setStep("describe")}
                className="px-4 py-2 text-sm text-[#6B6560] hover:text-[var(--ink-black)] cursor-pointer"
              >
                &larr; Back
              </button>
              <div className="flex gap-2">
                {sourceText?.trim() && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={!draft.systemPrompt || testing}
                    className="px-4 py-2 text-sm border border-[var(--ink-black)] text-[var(--ink-black)] rounded hover:bg-[var(--ink-black)] hover:text-[var(--ivory-cream)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {testing ? "Testing..." : "Test Preview"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!draft?.name || !draft?.systemPrompt}
                  className="px-4 py-2 text-sm bg-[var(--ink-black)] text-[var(--ivory-cream)] rounded hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  Save to Session
                </button>
              </div>
            </>
          )}
          {step === "test" && (
            <>
              <button
                type="button"
                onClick={() => setStep("review")}
                className="px-4 py-2 text-sm text-[#6B6560] hover:text-[var(--ink-black)] cursor-pointer"
              >
                &larr; Edit Definition
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!draft?.name || !draft?.systemPrompt}
                className="px-4 py-2 text-sm bg-[var(--ink-black)] text-[var(--ivory-cream)] rounded hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Save to Session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
