import type { AnalyticsEntry, AnalyticsSummary } from "@/app/lib/types/analytics";

type AnalyticsPanelProps = {
  entries: AnalyticsEntry[];
  summary: AnalyticsSummary;
  onClear: () => void;
};

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Short endpoint label: "formalization/semiformal" -> "semiformal" */
function shortEndpoint(endpoint: string): string {
  const parts = endpoint.split("/");
  return parts[parts.length - 1];
}

/** Short model label: "anthropic/claude-opus-4.6" -> "claude-opus-4.6" */
function shortModel(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1];
}

export default function AnalyticsPanel({ entries, summary, onClear }: AnalyticsPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
          AI Usage
        </h2>
        <button
          onClick={onClear}
          className="rounded px-2 py-1 text-xs text-[#6B6560] hover:bg-[#E8E4E0] hover:text-[var(--ink-black)]"
        >
          Clear Session
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="AI Calls" value={String(summary.totalCalls)} />
          <SummaryCard
            label="Total Processed"
            value={formatTokens(summary.totalInputTokens + summary.totalOutputTokens)}
          />
          <SummaryCard label="Est. Cost" value={formatCost(summary.totalCostUsd)} />
          <SummaryCard label="Avg Response Time" value={formatLatency(summary.averageLatencyMs)} />
        </div>

        {/* Detail table */}
        {entries.length === 0 ? (
          <p className="text-center text-sm text-[#9A9590]">
            No AI calls yet. Use the app to see usage data here.
          </p>
        ) : (
          <div className="overflow-auto rounded border border-[#E8E4E0]">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#E8E4E0] bg-[#F5F1ED] text-left text-[#6B6560]">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Endpoint</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3 py-2 text-right">Out</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2 text-right">Response</th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((e) => (
                  <tr key={e.id} className="border-b border-[#F0EBE6] hover:bg-[#F5F1ED]">
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#6B6560]">{formatTime(e.timestamp)}</td>
                    <td className="px-3 py-1.5">{shortEndpoint(e.endpoint)}</td>
                    <td className="px-3 py-1.5 text-[#6B6560]">{shortModel(e.model)}</td>
                    <td className="px-3 py-1.5 text-right">{e.inputTokens.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right">{e.outputTokens.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right">{formatCost(e.costUsd)}</td>
                    <td className="px-3 py-1.5 text-right">{formatLatency(e.latencyMs)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#DDD9D5] bg-[#F5F1ED] font-semibold">
                  <td className="px-3 py-2" colSpan={3}>Total ({entries.length} calls)</td>
                  <td className="px-3 py-2 text-right">{summary.totalInputTokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{summary.totalOutputTokens.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{formatCost(summary.totalCostUsd)}</td>
                  <td className="px-3 py-2 text-right">{formatLatency(summary.averageLatencyMs)} avg</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#E8E4E0] bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-[#9A9590]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-[var(--ink-black)]">{value}</div>
    </div>
  );
}
