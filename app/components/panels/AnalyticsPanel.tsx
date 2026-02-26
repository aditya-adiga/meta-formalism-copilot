import type { EndpointPrior } from "@/app/lib/types/analytics";
import { computeCost } from "@/app/lib/llm/costs";

type AnalyticsPanelProps = {
  endpointPriors: Record<string, EndpointPrior>;
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

/** Short endpoint label: "formalization/semiformal" -> "semiformal" */
function shortEndpoint(endpoint: string): string {
  const parts = endpoint.split("/");
  return parts[parts.length - 1];
}

export default function AnalyticsPanel({ endpointPriors }: AnalyticsPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--ivory-cream)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#DDD9D5] bg-[#F5F1ED] px-6 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-black)]">
          LLM Usage Estimates
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
        {/* Typical Ranges table from prior data */}
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6B6560]">
          Typical Ranges
        </h3>
        <div className="overflow-auto rounded border border-[#E8E4E0]">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[#E8E4E0] bg-[#F5F1ED] text-left text-[#6B6560]">
                <th className="px-3 py-2">Endpoint</th>
                <th className="px-3 py-2 text-right">Data Pts</th>
                <th className="px-3 py-2 text-right">Output Tokens</th>
                <th className="px-3 py-2 text-right">Cost Range</th>
                <th className="px-3 py-2 text-right">Latency Range</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(endpointPriors).map(([endpoint, prior]) => {
                const lowOut = Math.max(50, prior.meanOutputTokens - prior.stddevOutputTokens);
                const highOut = prior.meanOutputTokens + prior.stddevOutputTokens;
                const lowLat = Math.max(0, prior.meanLatencyMs - prior.stddevLatencyMs);
                const highLat = prior.meanLatencyMs + prior.stddevLatencyMs;
                return (
                  <tr key={endpoint} className="border-b border-[#F0EBE6] hover:bg-[#F5F1ED]">
                    <td className="px-3 py-1.5">{shortEndpoint(endpoint)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {prior.n === 0 ? (
                        <span className="text-[#9A9590]">est.</span>
                      ) : (
                        prior.n
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {formatTokens(lowOut)}&ndash;{formatTokens(highOut)}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {formatCost(computeCost(prior.model, 0, lowOut))}&ndash;{formatCost(computeCost(prior.model, 0, highOut))}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {formatLatency(lowLat)}&ndash;{formatLatency(highLat)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
