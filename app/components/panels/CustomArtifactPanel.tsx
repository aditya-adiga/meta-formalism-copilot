"use client";

import type { CustomArtifactTypeDefinition } from "@/app/lib/types/customArtifact";
import ArtifactPanelShell from "./ArtifactPanelShell";

type CustomArtifactPanelProps = {
  definition: CustomArtifactTypeDefinition;
  /** Raw content — JSON string or plain text, depending on outputFormat */
  content: string | null;
  loading?: boolean;
};

/**
 * Renders a section for a JSON value. Strings render as paragraphs,
 * arrays as lists, objects as nested sections.
 */
function JsonSection({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">{label}</h3>
        <p className="text-sm text-[var(--ink-black)] leading-relaxed whitespace-pre-wrap">{String(value)}</p>
      </section>
    );
  }

  if (Array.isArray(value)) {
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">
          {label} ({value.length})
        </h3>
        <div className="space-y-2">
          {value.map((item, i) => {
            if (typeof item === "string" || typeof item === "number") {
              return (
                <div key={i} className="rounded border border-[#DDD9D5] bg-white px-3 py-2 text-sm text-[var(--ink-black)]">
                  {String(item)}
                </div>
              );
            }
            if (typeof item === "object" && item !== null) {
              return (
                <div key={i} className="rounded border border-[#DDD9D5] bg-white px-3 py-2 space-y-1">
                  {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="text-sm">
                      <span className="font-semibold text-[#6B6560]">{formatLabel(k)}:</span>{" "}
                      <span className="text-[var(--ink-black)]">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              );
            }
            return null;
          })}
        </div>
      </section>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#6B6560] mb-2">{label}</h3>
        <div className="space-y-4 pl-2 border-l-2 border-[#DDD9D5]">
          {entries.map(([k, v]) => (
            <JsonSection key={k} label={formatLabel(k)} value={v} />
          ))}
        </div>
      </section>
    );
  }

  return null;
}

/** Convert camelCase, snake_case, or kebab-case keys to a readable label */
export function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\s/, "")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generic panel for user-defined custom artifact types.
 * Renders text output as formatted text, JSON output as a recursive key-value display.
 */
export default function CustomArtifactPanel({ definition, content, loading }: CustomArtifactPanelProps) {
  let parsedContent: unknown = null;
  if (content) {
    if (definition.outputFormat === "json") {
      try {
        parsedContent = JSON.parse(content);
      } catch {
        // Fall back to text display
        parsedContent = content;
      }
    } else {
      parsedContent = content;
    }
  }

  return (
    <ArtifactPanelShell
      title={definition.name}
      loading={loading}
      hasData={content !== null}
      emptyMessage={`No ${definition.name.toLowerCase()} generated yet. Select this type and click Formalise.`}
      loadingMessage={`Generating ${definition.name.toLowerCase()}...`}
    >
      {parsedContent !== null && (
        <>
          {typeof parsedContent === "string" ? (
            <section>
              <p className="text-sm text-[var(--ink-black)] leading-relaxed whitespace-pre-wrap font-serif">
                {parsedContent}
              </p>
            </section>
          ) : typeof parsedContent === "object" && !Array.isArray(parsedContent) ? (
            Object.entries(parsedContent as Record<string, unknown>).map(([key, value]) => (
              <JsonSection key={key} label={formatLabel(key)} value={value} />
            ))
          ) : Array.isArray(parsedContent) ? (
            <JsonSection label="Results" value={parsedContent} />
          ) : (
            <section>
              <p className="text-sm text-[var(--ink-black)]">{String(parsedContent)}</p>
            </section>
          )}
        </>
      )}
    </ArtifactPanelShell>
  );
}
