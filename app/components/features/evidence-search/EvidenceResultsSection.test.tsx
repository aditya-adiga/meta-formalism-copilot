import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EvidenceResultsSection from "./EvidenceResultsSection";
import type { EvidencePaper, EvidenceSlot } from "@/app/lib/types/evidence";

const paper = (id: string, status: EvidencePaper["status"]): EvidencePaper => ({
  openAlexId: id,
  title: `Paper ${id}`,
  authors: [],
  year: null,
  abstract: null,
  citedByCount: 0,
  journal: null,
  doi: null,
  oaUrl: null,
  reliability: null,
  relatedness: null,
  status,
});

const slot = (papers: EvidencePaper[]): EvidenceSlot => ({
  targetKey: { artifactType: "statistical-model", elementId: "artifact" },
  searchQueries: ["alpha"],
  papers,
  searchedAt: "2026-05-21T00:00:00.000Z",
  scoredAt: null,
});

const noop = () => {};

describe("EvidenceResultsSection", () => {
  it("counts only active papers and groups pruned separately", () => {
    render(
      <EvidenceResultsSection
        slot={slot([paper("W1", "retrieved"), paper("W2", "pruned")])}
        onRerun={noop}
        onPrune={noop}
        onRestore={noop}
      />,
    );
    expect(screen.getByText(/1 paper found/i)).toBeInTheDocument();
    expect(screen.getByText(/pruned \(1\)/i)).toBeInTheDocument();
  });

  it("re-runs with the edited queries", async () => {
    const onRerun = vi.fn();
    render(
      <EvidenceResultsSection
        slot={slot([paper("W1", "retrieved")])}
        onRerun={onRerun}
        onPrune={noop}
        onRestore={noop}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add query/i }));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[1], "beta");
    await userEvent.click(screen.getByRole("button", { name: /re-run/i }));
    expect(onRerun).toHaveBeenCalledWith(["alpha", "beta"]);
  });
});
